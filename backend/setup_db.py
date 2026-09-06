"""One-time setup: choose a database, verify it works, seed the demo account.

    python -m backend.setup_db            # interactive
    python -m backend.setup_db --sqlite   # no questions: local SQLite file
    python -m backend.setup_db --check    # just report what the API would use

Interactive mode asks for PostgreSQL details, writes DATABASE_URL into .env
(gitignored) and checks the schema is present. If no PostgreSQL is installed
it offers SQLite instead, which needs no setup at all: the schema is applied
automatically the first time the API opens the file.

Re-runnable; it only rewrites the DATABASE_URL line.
"""

from __future__ import annotations

import argparse
import getpass
import pathlib
import sys
from urllib.parse import quote

from .config import project_root

EXPECTED_TABLES = {
    "users", "sessions", "otp_challenges", "recovery_tickets", "auth_events",
    "languages", "signs", "symbols", "symbol_views",
    "language_installs", "language_reports",
    "interpretation_sessions", "interpretation_readings", "user_preferences",
}


def write_env(url: str | None) -> pathlib.Path:
    """Set (or clear) DATABASE_URL in .env, leaving every other line untouched."""
    path = project_root() / ".env"
    lines = path.read_text(encoding="utf-8").splitlines() if path.is_file() else []
    kept = [ln for ln in lines if not ln.strip().startswith("DATABASE_URL=")]
    if url:
        kept.append(f"DATABASE_URL={url}")
    path.write_text("\n".join(kept) + ("\n" if kept else ""), encoding="utf-8")
    return path


def _tables() -> set[str]:
    from . import db

    if db.engine_name() == "postgres":
        rows = db.fetch_all(
            "SELECT table_name AS name FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
        )
    else:
        rows = db.fetch_all(
            "SELECT name FROM sqlite_master WHERE type = 'table' "
            "AND name NOT LIKE 'sqlite_%'"
        )
    return {r["name"] for r in rows}


def verify() -> int:
    """Connect with whatever the environment says, report, seed the demo user."""
    from . import db
    db.close_pool()

    ok, message = db.healthcheck()
    if not ok:
        print(f"\n  FAILED: {message}")
        if "postgres" in message:
            print("  Check the password, and that the database exists:")
            print("    powershell -ExecutionPolicy Bypass -File db\\apply.ps1")
            print("  Or run with SQLite instead:  python -m backend.setup_db --sqlite")
        return 1
    print(f"  {message}")

    found = _tables()
    missing = EXPECTED_TABLES - found
    if missing:
        print(f"\n  Schema incomplete - missing: {', '.join(sorted(missing))}")
        if db.engine_name() == "postgres":
            print("  Run:  powershell -ExecutionPolicy Bypass -File db\\apply.ps1")
        return 1
    print(f"  schema OK ({len(found & EXPECTED_TABLES)} tables, {db.engine_name()})")

    from .auth import DEMO_EMAIL, DEMO_PASSWORD, AuthService
    from .auth.sql_store import SqlStore

    AuthService(store=SqlStore(), seed_demo_account=True)
    print(f"  demo account ready: {DEMO_EMAIL} / {DEMO_PASSWORD}")

    print("\nDone. Start the API with:")
    print("  python -m uvicorn backend.api.main:app --reload --port 8000\n")
    return 0


def setup_sqlite() -> int:
    from . import db

    url = "sqlite:///backend/data/signtalk.db"
    path = write_env(url)
    print(f"\nWrote DATABASE_URL={url} to {path}")
    print(f"  database file: {db.DEFAULT_SQLITE_PATH}")
    return verify()


def setup_postgres() -> int:
    host = input("Host [localhost]: ").strip() or "localhost"
    port = input("Port [5432]: ").strip() or "5432"
    name = input("Database [signtalk]: ").strip() or "signtalk"
    user = input("User [postgres]: ").strip() or "postgres"
    password = getpass.getpass("Password: ")

    # Quote the credentials: a password with @ or / would otherwise break the URL.
    url = (f"postgresql://{quote(user, safe='')}:{quote(password, safe='')}"
           f"@{host}:{port}/{name}")

    path = write_env(url)
    print(f"\nWrote DATABASE_URL to {path}")
    return verify()


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--sqlite", action="store_true",
                        help="use a local SQLite file, no questions asked")
    parser.add_argument("--postgres", action="store_true",
                        help="prompt for PostgreSQL details")
    parser.add_argument("--check", action="store_true",
                        help="only report which database the API would use")
    args = parser.parse_args(argv)

    print("\nSignTalk database setup\n" + "-" * 40)

    if args.check:
        from . import db
        print(f"  {db.describe()}")
        return verify()

    if args.sqlite:
        return setup_sqlite()
    if args.postgres:
        return setup_postgres()

    from . import db
    reachable, why = db._postgres_answers(db.DEFAULT_PG_URL, db.PROBE_SECONDS)
    if reachable:
        print("  A PostgreSQL server is listening on localhost:5432.")
    else:
        print(f"  No PostgreSQL on localhost:5432 ({why}).")
        print("  SQLite needs no install and is the right call for one machine.")

    choice = input(
        f"\n  [1] PostgreSQL (enter connection details)\n"
        f"  [2] SQLite (local file, zero setup){'  <- recommended' if not reachable else ''}\n"
        f"\nChoose [{'1' if reachable else '2'}]: "
    ).strip() or ("1" if reachable else "2")

    return setup_postgres() if choice == "1" else setup_sqlite()


if __name__ == "__main__":
    sys.exit(main())
