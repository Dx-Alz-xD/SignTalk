"""PostgreSQL connection pool.

One pool for the process, opened lazily so importing this module never needs a
running database (the CLI and the tests import backend.* without one).

Connection string comes from DATABASE_URL in the environment or .env - see
config.load_env_file, which already keeps secrets out of git.
"""

from __future__ import annotations

import hashlib
import os
from contextlib import contextmanager

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import load_env_file

DEFAULT_URL = "postgresql://postgres@localhost:5432/signtalk"

_pool: ConnectionPool | None = None


def database_url() -> str:
    load_env_file()
    return os.environ.get("DATABASE_URL") or DEFAULT_URL


def pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            database_url(),
            min_size=1,
            max_size=10,
            # Fail fast with a clear message rather than hanging a web request.
            timeout=10,
            kwargs={"row_factory": dict_row},
            open=True,
        )
    return _pool


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


@contextmanager
def connection():
    """A pooled connection. Commits on clean exit, rolls back on exception."""
    with pool().connection() as conn:
        yield conn


@contextmanager
def cursor():
    with connection() as conn:
        with conn.cursor() as cur:
            yield cur


def fetch_one(sql: str, params=()):
    with cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone()


def fetch_all(sql: str, params=()) -> list:
    with cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def execute(sql: str, params=()) -> int:
    with cursor() as cur:
        cur.execute(sql, params)
        return cur.rowcount


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
        row = fetch_one("SELECT current_database() AS db, version() AS version")
        return True, f"connected to {row['db']}"
    except Exception as exc:
        return False, f"{exc.__class__.__name__}: {exc}"
