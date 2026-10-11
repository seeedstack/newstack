import psycopg

import db
import seed_sources

DSN = db.DSN


def test_seed_inserts_all_sources_then_is_idempotent():
    # seed_sources.SOURCES is the real production list (ON CONFLICT DO NOTHING, per
    # its own docstring: "safe to re-run on every deploy"). Sources are never hard-deleted
    # (ARCHITECTURE invariant; no cascading FK from ingestion_runs/articles), so this test
    # cannot force a blank slate on a dev DB that has already ingested against these
    # sources — it only checks the idempotency property itself, not a fresh-insert count.
    with psycopg.connect(DSN, autocommit=True) as conn:
        seed_sources.seed(conn)
        second_count = seed_sources.seed(conn)

    assert second_count == 0

    with psycopg.connect(DSN, autocommit=True) as conn:
        domains = {r[0] for r in conn.execute(
            "SELECT domain FROM sources WHERE domain = ANY(%s)",
            ([s["domain"] for s in seed_sources.SOURCES],),
        )}
    assert domains == {s["domain"] for s in seed_sources.SOURCES}
