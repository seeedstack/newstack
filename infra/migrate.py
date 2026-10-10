"""Applies infra/migrations/*.sql in filename order, once each, tracked in schema_migrations.
Migrations are the only schema authority (ARCHITECTURE §12) — nothing else creates or alters
a table. usage: DATABASE_URL=... python infra/migrate.py
"""
import os
import pathlib
import sys

import psycopg

DSN = os.environ.get("DATABASE_URL", "postgresql://newstack:newstack@localhost:5432/newstack")
MIGRATIONS_DIR = pathlib.Path(__file__).parent / "migrations"


def main() -> None:
    with psycopg.connect(DSN, autocommit=False) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                filename TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """)
        conn.commit()
        for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
            applied = conn.execute(
                "SELECT 1 FROM schema_migrations WHERE filename = %s", (path.name,)
            ).fetchone()
            if applied:
                print(f"{path.name}: already applied")
                continue
            sql = path.read_text(encoding="utf-8")
            with conn.transaction():
                conn.execute(sql)
                conn.execute(
                    "INSERT INTO schema_migrations (filename) VALUES (%s)", (path.name,)
                )
            print(f"{path.name}: applied")


if __name__ == "__main__":
    main()
