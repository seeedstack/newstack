import uuid

import psycopg

import db
from jobs import maintenance

DSN = db.DSN


def test_old_ingestion_runs_deleted_recent_kept():
    with psycopg.connect(DSN, autocommit=True) as conn:
        sid = conn.execute(
            "INSERT INTO sources (name, domain, country_code, language, feed_timezone) "
            "VALUES (%s, %s, 'IN', 'en', 'Asia/Kolkata') RETURNING id",
            (f"Src {uuid.uuid4()}", f"{uuid.uuid4()}.example"),
        ).fetchone()[0]
        old_id = conn.execute(
            "INSERT INTO ingestion_runs (source_id, started_at, finished_at, outcome) "
            "VALUES (%s, now() - interval '20 days', now() - interval '20 days', 'ok') RETURNING id",
            (sid,),
        ).fetchone()[0]
        recent_id = conn.execute(
            "INSERT INTO ingestion_runs (source_id, started_at, finished_at, outcome) "
            "VALUES (%s, now() - interval '1 day', now() - interval '1 day', 'ok') RETURNING id",
            (sid,),
        ).fetchone()[0]

    with psycopg.connect(DSN) as conn:
        maintenance.run(conn)

    with psycopg.connect(DSN, autocommit=True) as conn:
        remaining = {r[0] for r in conn.execute("SELECT id FROM ingestion_runs WHERE source_id = %s", (sid,))}
        conn.execute("DELETE FROM ingestion_runs WHERE source_id = %s", (sid,))
        conn.execute("DELETE FROM source_ingestion_state WHERE source_id = %s", (sid,))
        conn.execute("DELETE FROM sources WHERE id = %s", (sid,))
    assert old_id not in remaining
    assert recent_id in remaining


def test_expired_refresh_parent_deletion_keeps_live_child():
    """The I-level guarantee from ARCHITECTURE §11: refresh_sessions.parent_id is
    ON DELETE SET NULL, so deleting an expired parent never deletes a live child token."""
    with psycopg.connect(DSN, autocommit=True) as conn:
        uid = conn.execute(
            "INSERT INTO users (email, password_hash) VALUES (%s, 'x') RETURNING id",
            (f"{uuid.uuid4()}@example.com",),
        ).fetchone()[0]
        family = str(uuid.uuid4())
        parent_id = conn.execute(
            "INSERT INTO refresh_sessions (user_id, family_id, token_hash, expires_at) "
            "VALUES (%s, %s, 'expired-parent', now() - interval '8 days') RETURNING id",
            (uid, family),
        ).fetchone()[0]
        child_id = conn.execute(
            "INSERT INTO refresh_sessions (user_id, family_id, parent_id, token_hash, expires_at) "
            "VALUES (%s, %s, %s, 'live-child', now() + interval '20 days') RETURNING id",
            (uid, family, parent_id),
        ).fetchone()[0]

    with psycopg.connect(DSN) as conn:
        maintenance.run(conn)

    with psycopg.connect(DSN, autocommit=True) as conn:
        child_row = conn.execute(
            "SELECT parent_id FROM refresh_sessions WHERE id = %s", (child_id,)
        ).fetchone()
        conn.execute("DELETE FROM refresh_sessions WHERE user_id = %s", (uid,))
        conn.execute("DELETE FROM users WHERE id = %s", (uid,))
    assert child_row == (None,)  # child survives; parent_id set NULL, not cascaded away
