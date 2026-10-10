"""Daily maintenance job (ARCHITECTURE §11), verbatim. Runs under the leader lock, batched
later if data volume ever makes that necessary — see the note in the plan."""
from __future__ import annotations

import psycopg

MAINTENANCE_SQL = """
DELETE FROM refresh_sessions
 WHERE expires_at < now() - interval '7 days' OR revoked_at < now() - interval '7 days';
DELETE FROM password_reset_tokens     WHERE expires_at < now() - interval '1 day';
DELETE FROM email_verification_tokens WHERE expires_at < now() - interval '1 day';
DELETE FROM email_outbox   WHERE status IN ('sent','failed') AND created_at < now() - interval '30 days';
DELETE FROM auth_events    WHERE created_at < now() - interval '90 days';
DELETE FROM ingestion_runs WHERE started_at < now() - interval '14 days';
DELETE FROM account_deletions WHERE deleted_at < now() - interval '35 days';
DELETE FROM users
 WHERE email_verified_at IS NULL AND last_login_at IS NULL AND created_at < now() - interval '7 days';
"""


def run(conn: psycopg.Connection) -> None:
    with conn.transaction():
        conn.execute(MAINTENANCE_SQL)
