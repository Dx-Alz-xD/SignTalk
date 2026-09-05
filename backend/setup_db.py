"""One-time setup: point the backend at Postgres and verify it works.

    python -m backend.setup_db

Prompts for the database password, writes DATABASE_URL into .env (gitignored),
checks the connection, confirms the schema is present, and seeds the demo
account. Re-runnable; it only rewrites the DATABASE_URL line.
"""

from __future__ import annotations

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


def write_env(url: str) -> pathlib.Path:
    """Set DATABASE_URL in .env, leaving every other line untouched."""
    path = project_root() / ".env"
    lines = path.read_text(encoding="utf-8").splitlines() if path.is_file() else []
    kept = [ln for ln in lines if not ln.strip().startswith("DATABASE_URL=")]
    kept.append(f"DATABASE_URL={url}")
    path.write_text("\n".join(kept) + "\n", encoding="utf-8")
    return path


def main() -> int:
    print("\nSignTalk database setup\n" + "-" * 40)

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

    # Import only now - db reads DATABASE_URL from the environment at first use.
    from . import db
    db.close_pool()

    ok, message = db.healthcheck()
    if not ok:
        print(f"\n  FAILED: {message}")
        print("  Check the password, and that the database exists:")
        print("    powershell -ExecutionPolicy Bypass -File db\\apply.ps1")
        return 1
    print(f"  {message}")

    found = {r["table_name"] for r in db.fetch_all(
        "SELECT table_name FROM information_schema.tables "
        "WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
    )}
    missing = EXPECTED_TABLES - found
    if missing:
        print(f"\n  Schema incomplete - missing: {', '.join(sorted(missing))}")
        print("  Run:  powershell -ExecutionPolicy Bypass -File db\\apply.ps1")
        return 1
    print(f"  schema OK ({len(found)} tables)")

    from .auth import DEMO_EMAIL, DEMO_PASSWORD, AuthService
    from .auth.pg_store import PostgresStore

    AuthService(store=PostgresStore(), seed_demo_account=True)
    print(f"  demo account ready: {DEMO_EMAIL} / {DEMO_PASSWORD}")

    print("\nDone. Start the API with:")
    print("  python -m uvicorn backend.api.main:app --reload --port 8000\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
