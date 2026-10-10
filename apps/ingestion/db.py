"""Postgres access: one pooled connection for ordinary queries, one dedicated
non-pooled connection for the worker's advisory leader lock (ARCHITECTURE §8)."""
import os

import psycopg
from psycopg_pool import ConnectionPool

DSN = os.environ.get("DATABASE_URL", "postgresql://newstack:newstack@localhost:5432/newstack")

_pool: ConnectionPool | None = None


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(DSN, min_size=1, max_size=5, open=True)
    return _pool


def leader_connection(dsn: str) -> psycopg.Connection:
    """A dedicated connection, outside the pool, held for the worker's whole life."""
    conn = psycopg.connect(dsn, autocommit=True)
    return conn
