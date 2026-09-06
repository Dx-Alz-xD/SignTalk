"""Compatibility shim. The store is no longer Postgres-specific - it runs on
whichever engine backend/db.py selected - and lives in sql_store.py."""

from .sql_store import PostgresStore, SqlStore

__all__ = ["PostgresStore", "SqlStore"]
