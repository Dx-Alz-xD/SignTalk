"""Database access - PostgreSQL when it is there, SQLite when it is not.

Two engines behind one small API (fetch_one / fetch_all / execute /
transaction / healthcheck), chosen once per process:

  * ``DATABASE_URL=postgresql://...``  Postgres over psycopg, if psycopg is
    installed and the server answers. This is the deployment shape.
  * ``DATABASE_URL=sqlite:///path``     SQLite at that path.
  * nothing set                         probe the default local Postgres for a
    couple of seconds; if nothing is listening - which is every machine that
    never installed it - fall back to SQLite at ``backend/data/signtalk.db``.

The fallback exists so a fresh clone runs the whole app with ``pip install``
and nothing else. Set ``SIGNTALK_DB=postgres`` to refuse the fallback (a
deployment should fail loudly rather than quietly write to a local file), or
``SIGNTALK_DB=sqlite`` to skip the probe.

SQL is written once, in the Postgres dialect, with ``%s`` placeholders. The
SQLite engine rewrites placeholders and supplies ``now()`` /
``gen_random_uuid()`` so almost every statement runs unchanged; the handful
of constructs that genuinely differ (json aggregation, ILIKE, casts) are
looked up through ``dialect`` at the call site instead of duplicated.
"""

from __future__ import annotations

import datetime as _dt
import hashlib
import json
import os
import pathlib
import re
import sqlite3
import threading
import uuid
from contextlib import contextmanager

from .config import load_env_file, project_root

DEFAULT_PG_URL = "postgresql://postgres@localhost:5432/signtalk"
DEFAULT_SQLITE_PATH = project_root() / "backend" / "data" / "signtalk.db"
SQLITE_SCHEMA = project_root() / "db" / "schema.sqlite.sql"

# How long the unset-URL probe waits for a local Postgres before giving up.
PROBE_SECONDS = 2

# Columns added after a table first shipped. CREATE TABLE IF NOT EXISTS leaves
# an existing table alone, and SQLite has no ADD COLUMN IF NOT EXISTS, so the
# SQLite engine checks each of these on open and adds what is missing. Keep in
# step with the ALTER TABLE statements in db/schema.sql.
COLUMN_MIGRATIONS = (
    ("languages", "gesture_translation", "BOOLEAN NOT NULL DEFAULT 0"),
    ("languages", "gesture_interval_ms", "INTEGER NOT NULL DEFAULT 1200"),
    ("languages", "spoken_language", "TEXT NOT NULL DEFAULT 'en'"),
    ("languages", "tag", "TEXT NOT NULL DEFAULT ''"),
    ("user_preferences", "camera_device_id", "TEXT NOT NULL DEFAULT ''"),
    ("user_preferences", "show_skeleton", "BOOLEAN NOT NULL DEFAULT 1"),
    ("user_preferences", "pace", "TEXT NOT NULL DEFAULT 'careful'"),
    ("user_preferences", "capture_countdown", "INTEGER NOT NULL DEFAULT 3"),
    ("user_preferences", "reduce_motion", "BOOLEAN NOT NULL DEFAULT 0"),
    ("user_preferences", "overlay_x", "REAL NOT NULL DEFAULT 0.68"),
    ("user_preferences", "overlay_y", "REAL NOT NULL DEFAULT 0.06"),
    ("user_preferences", "overlay_width", "REAL NOT NULL DEFAULT 0.26"),
    ("user_preferences", "overlay_opacity", "REAL NOT NULL DEFAULT 0.95"),
    ("user_preferences", "overlay_caption", "BOOLEAN NOT NULL DEFAULT 1"),
)


# ================================================================ dialect ==

class Dialect:
    """The few SQL fragments that differ between the two engines."""

    def __init__(self, name: str) -> None:
        self.name = name
        self.is_postgres = name == "postgres"

    @property
    def uuid_param(self) -> str:
        """A parameter compared against a uuid column that may be NULL.

        Postgres cannot infer the type of a bare NULL parameter inside
        ``(%s IS NULL OR id = %s)``, hence the cast; SQLite ids are text.
        """
        return "%s::uuid" if self.is_postgres else "%s"

    def text(self, column: str) -> str:
        """Read a citext column back as plain text (a no-op on SQLite)."""
        return f"{column}::text" if self.is_postgres else column

    @property
    def ilike(self) -> str:
        # SQLite's LIKE is already case-insensitive for ASCII.
        return "ILIKE" if self.is_postgres else "LIKE"

    @property
    def is_distinct_from(self) -> str:
        return "IS DISTINCT FROM" if self.is_postgres else "IS NOT"

    @property
    def views_json(self) -> str:
        """Aggregate a symbol's views into one JSON array, sorted by view."""
        if self.is_postgres:
            return """
               COALESCE(json_agg(
                   json_build_object('view', v.view, 'samples', v.sample_count,
                                     'spread', v.quality_spread,
                                     'feature_version', v.feature_version)
                   ORDER BY v.view
               ) FILTER (WHERE v.id IS NOT NULL), '[]')"""
        return """
               json_group_array(
                   json_object('view', v.view, 'samples', v.sample_count,
                               'spread', v.quality_spread,
                               'feature_version', v.feature_version)
                   ORDER BY v.view
               ) FILTER (WHERE v.id IS NOT NULL)"""


# ================================================================ engines ==

class _Postgres:
    name = "postgres"

    def __init__(self, url: str) -> None:
        from psycopg.rows import dict_row
        from psycopg_pool import ConnectionPool

        self.url = url
        self.dialect = Dialect(self.name)
        self._pool = ConnectionPool(
            url,
            min_size=1,
            max_size=10,
            # Fail fast with a clear message rather than hanging a web request.
            timeout=10,
            kwargs={"row_factory": dict_row},
            open=True,
        )

    def close(self) -> None:
        self._pool.close()

    @contextmanager
    def _cursor(self):
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                yield cur

    def fetch_one(self, sql, params=()):
        with self._cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchone()

    def fetch_all(self, sql, params=()):
        with self._cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall()

    def execute(self, sql, params=()) -> int:
        with self._cursor() as cur:
            cur.execute(sql, params)
            return cur.rowcount

    @contextmanager
    def transaction(self):
        with self._pool.connection() as conn:
            with conn.transaction():
                yield _PgTx(conn)

    def healthcheck(self) -> tuple[bool, str]:
        try:
            row = self.fetch_one("SELECT current_database() AS db")
            return True, f"postgres: connected to {row['db']}"
        except Exception as exc:
            return False, f"postgres: {exc.__class__.__name__}: {exc}"

    def describe(self) -> str:
        return f"PostgreSQL ({_redact(self.url)})"


class _PgTx:
    """Statements inside one Postgres transaction."""

    def __init__(self, conn) -> None:
        self._conn = conn

    def fetch_one(self, sql, params=()):
        return self._conn.execute(sql, params).fetchone()

    def fetch_all(self, sql, params=()):
        return self._conn.execute(sql, params).fetchall()

    def execute(self, sql, params=()) -> int:
        return self._conn.execute(sql, params).rowcount


_ISO_STAMP = re.compile(r"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}")

# Column names whose values need coaxing back into the Python types the
# Postgres driver would have produced. Name-based on purpose: SQLite only
# reports a declared type for plain column reads, not for RETURNING rows or
# expressions, and the auth models compare these as datetimes / bools.
_STAMP_COLUMNS = {"locked_until"}
_BOOL_COLUMNS = {"has_phrases", "mine", "installed", "trained", "gesture_translation",
                 "has_image", "mirror_preview", "show_skeleton", "reduce_motion",
                 "overlay_caption"}
_JSON_COLUMNS = {"phrases", "views", "detail"}


def _sqlite_now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


def _parse_stamp(value: str) -> _dt.datetime:
    stamp = _dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=_dt.timezone.utc)
    return stamp


def _normalise_row(row: dict) -> dict:
    for key, value in row.items():
        if value is None:
            continue
        if key in _BOOL_COLUMNS and isinstance(value, int):
            row[key] = bool(value)
        elif key in _JSON_COLUMNS and isinstance(value, str):
            try:
                row[key] = json.loads(value)
            except ValueError:
                pass
        elif isinstance(value, str) and (key.endswith("_at") or key in _STAMP_COLUMNS) \
                and _ISO_STAMP.match(value):
            try:
                row[key] = _parse_stamp(value)
            except ValueError:
                pass
    return row


class _Sqlite:
    name = "sqlite"

    def __init__(self, path: pathlib.Path) -> None:
        self.path = pathlib.Path(path)
        self.dialect = Dialect(self.name)
        self.path.parent.mkdir(parents=True, exist_ok=True)

        # One connection, one lock: the API's worker threads take turns. SQLite
        # serialises writers anyway, and this keeps the schema, the pragmas and
        # the registered functions in a single place.
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(
            str(self.path),
            check_same_thread=False,
            detect_types=sqlite3.PARSE_DECLTYPES,
            isolation_level=None,          # autocommit; transaction() is explicit
        )
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._conn.execute("PRAGMA journal_mode = WAL")
        self._conn.execute("PRAGMA busy_timeout = 5000")

        # The Postgres builtins the shared SQL leans on.
        self._conn.create_function("now", 0, _sqlite_now, deterministic=False)
        self._conn.create_function("gen_random_uuid", 0, lambda: str(uuid.uuid4()),
                                   deterministic=False)

        self._apply_schema()

    def _apply_schema(self) -> None:
        if not SQLITE_SCHEMA.is_file():
            raise RuntimeError(f"SQLite schema missing: {SQLITE_SCHEMA}")
        with self._lock:
            # Columns first, for a database created before they existed: the
            # schema script's backfill statements refer to them.
            for table, column, ddl in COLUMN_MIGRATIONS:
                exists = self._conn.execute(
                    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (table,)
                ).fetchone()
                if not exists:
                    continue
                present = {row[1] for row in
                           self._conn.execute(f"PRAGMA table_info({table})").fetchall()}
                if column not in present:
                    self._conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
            self._conn.executescript(SQLITE_SCHEMA.read_text(encoding="utf-8"))

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    # ---------------------------------------------------------- plumbing --
    @staticmethod
    def _prepare(sql: str, params):
        return sql.replace("%s", "?"), [_adapt(p) for p in params]

    def _run(self, sql, params):
        sql, params = self._prepare(sql, params)
        return self._conn.execute(sql, params)

    def fetch_one(self, sql, params=()):
        with self._lock:
            row = self._run(sql, params).fetchone()
        return _normalise_row(dict(row)) if row is not None else None

    def fetch_all(self, sql, params=()):
        with self._lock:
            rows = self._run(sql, params).fetchall()
        return [_normalise_row(dict(r)) for r in rows]

    def execute(self, sql, params=()) -> int:
        with self._lock:
            return self._run(sql, params).rowcount

    @contextmanager
    def transaction(self):
        with self._lock:
            self._conn.execute("BEGIN")
            try:
                yield self          # same methods; the lock is re-entrant
            except BaseException:
                self._conn.execute("ROLLBACK")
                raise
            else:
                self._conn.execute("COMMIT")

    def healthcheck(self) -> tuple[bool, str]:
        try:
            with self._lock:
                self._conn.execute("SELECT 1").fetchone()
            return True, f"sqlite: {self.path}"
        except Exception as exc:
            return False, f"sqlite: {exc.__class__.__name__}: {exc}"

    def describe(self) -> str:
        return f"SQLite ({self.path})"


def _adapt(value):
    """Python -> SQLite. Mirrors what psycopg would send to Postgres."""
    if isinstance(value, _dt.datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=_dt.timezone.utc)
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, (list, tuple, dict)):
        return json.dumps(list(value) if isinstance(value, tuple) else value)
    if isinstance(value, memoryview):
        return bytes(value)
    return value


# ============================================================== selection ==

_engine = None
_engine_lock = threading.Lock()


def database_url() -> str | None:
    load_env_file()
    return os.environ.get("DATABASE_URL") or None


def _sqlite_path(url: str | None) -> pathlib.Path:
    if not url:
        return DEFAULT_SQLITE_PATH
    # sqlite:///relative/or/C:/absolute  |  sqlite:////unix/absolute
    tail = url.split("://", 1)[1].lstrip("/") if "://" in url else url
    path = pathlib.Path(tail)
    if not path.is_absolute():
        path = project_root() / path
    return path


def _port_open(url: str, seconds: float) -> bool:
    """Is anything listening where the URL points? A raw socket answers in
    well under a second, where libpq waits out its full timeout on Windows."""
    import socket
    from urllib.parse import urlsplit

    parts = urlsplit(url)
    host, port = parts.hostname or "localhost", parts.port or 5432
    try:
        with socket.create_connection((host, port), timeout=seconds):
            return True
    except OSError:
        return False


def _postgres_answers(url: str, seconds: int) -> tuple[bool, str]:
    try:
        import psycopg
    except ImportError:
        return False, "psycopg is not installed"
    if not _port_open(url, 0.75):
        return False, "nothing is listening on that port"
    try:
        with psycopg.connect(url, connect_timeout=seconds):
            return True, ""
    except Exception as exc:
        return False, f"{exc.__class__.__name__}: {exc}".splitlines()[0].strip()


def _choose():
    """Decide which engine this process uses. Runs once."""
    preference = os.environ.get("SIGNTALK_DB", "").strip().lower()
    url = database_url()

    if preference == "sqlite" or (url or "").startswith("sqlite"):
        return _Sqlite(_sqlite_path(url if (url or "").startswith("sqlite") else None))

    target = url or DEFAULT_PG_URL
    ok, why = _postgres_answers(target, PROBE_SECONDS if not url else 10)
    if ok:
        return _Postgres(target)

    if preference == "postgres" or (url and url.startswith("postgres")):
        # Asked for Postgres by name: do not paper over a broken deployment.
        raise RuntimeError(
            f"Could not connect to PostgreSQL at {_redact(target)}: {why}. "
            "Start the server, fix DATABASE_URL, or set SIGNTALK_DB=sqlite."
        )

    print(f"  [db] No PostgreSQL at {_redact(target)} ({why}); "
          f"using SQLite at {DEFAULT_SQLITE_PATH}")
    return _Sqlite(DEFAULT_SQLITE_PATH)


def engine():
    global _engine
    if _engine is None:
        with _engine_lock:
            if _engine is None:
                _engine = _choose()
    return _engine


def close_pool() -> None:
    """Release connections. Kept under its old name for callers that have it."""
    global _engine
    if _engine is not None:
        _engine.close()
        _engine = None


def _redact(url: str) -> str:
    """Hide a password if the URL carries one."""
    return re.sub(r"://([^:/@]+):[^@]*@", r"://\1:***@", url)


# ============================================================ public API ==

def fetch_one(sql: str, params=()):
    return engine().fetch_one(sql, params)


def fetch_all(sql: str, params=()) -> list:
    return engine().fetch_all(sql, params)


def execute(sql: str, params=()) -> int:
    return engine().execute(sql, params)


@contextmanager
def transaction():
    """Run several statements atomically. Yields an object with the same
    fetch_one / fetch_all / execute methods."""
    with engine().transaction() as tx:
        yield tx


class _DialectProxy:
    """``db.dialect.ilike`` etc. without forcing the engine to open at import."""

    def __getattr__(self, item):
        return getattr(engine().dialect, item)

    def text(self, column: str) -> str:
        return engine().dialect.text(column)


dialect = _DialectProxy()


def engine_name() -> str:
    return engine().name


def describe() -> str:
    return engine().describe()


def token_digest(token: str) -> bytes:
    """SHA-256 of a bearer credential.

    Session tokens, challenge ids and recovery ticket ids are all stored as
    this digest, never in the clear. They are bearer credentials exactly like
    a password: anyone who reads the table would otherwise be able to replay
    them. Hashing costs one comparison and makes a leaked dump inert.
    """
    return hashlib.sha256(token.encode("utf-8")).digest()


def healthcheck() -> tuple[bool, str]:
    """(ok, message) - used by the API's /health endpoint and setup scripts."""
    try:
        return engine().healthcheck()
    except Exception as exc:
        return False, f"{exc.__class__.__name__}: {exc}"
