import os
import db

def test_dsn_defaults_when_env_unset(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    import importlib
    importlib.reload(db)
    assert db.DSN == "postgresql://newstack:newstack@localhost:5432/newstack"

def test_get_pool_returns_working_connection():
    pool = db.get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
            assert cur.fetchone() == (1,)

def test_leader_connection_is_not_pooled():
    conn = db.leader_connection(db.DSN)
    with conn.cursor() as cur:
        cur.execute("SELECT 1")
        assert cur.fetchone() == (1,)
    conn.close()
