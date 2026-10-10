import subprocess
import sys
import psycopg
import pytest

DSN = "postgresql://newstack:newstack@localhost:5432/newstack"

EXPECTED_TABLES = [
    "sources", "source_ratings", "bias_baselines", "source_ingestion_state", "ingestion_runs",
    "stories", "story_lineage", "clustering_state", "articles", "epoch_build", "cluster_reports",
    "users", "refresh_sessions", "password_reset_tokens", "email_verification_tokens",
    "email_outbox", "auth_events", "account_deletions", "topics",
    "user_saved_sources", "user_saved_stories", "user_saved_topics", "schema_migrations",
]

@pytest.fixture(autouse=True)
def clean_db():
    with psycopg.connect(DSN, autocommit=True) as conn:
        conn.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
    yield

def test_migrate_creates_every_table():
    subprocess.run([sys.executable, "infra/migrate.py"], check=True, env={"DATABASE_URL": DSN})
    with psycopg.connect(DSN, autocommit=True) as conn:
        rows = conn.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public'").fetchall()
    found = {r[0] for r in rows}
    missing = set(EXPECTED_TABLES) - found
    assert not missing, f"missing tables: {missing}"

def test_migrate_is_idempotent():
    subprocess.run([sys.executable, "infra/migrate.py"], check=True, env={"DATABASE_URL": DSN})
    result = subprocess.run([sys.executable, "infra/migrate.py"], capture_output=True, text=True, env={"DATABASE_URL": DSN})
    assert result.returncode == 0
    assert "0001_initial_schema.sql: already applied" in result.stdout
