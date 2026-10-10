import psycopg

import db
import seed_sources

DSN = db.DSN


def test_seed_inserts_all_sources_then_is_idempotent():
    with psycopg.connect(DSN, autocommit=True) as conn:
        conn.execute("DELETE FROM source_ingestion_state WHERE source_id IN "
                     "(SELECT id FROM sources WHERE domain = ANY(%s))",
                     ([s["domain"] for s in seed_sources.SOURCES],))
        conn.execute("DELETE FROM sources WHERE domain = ANY(%s)",
                     ([s["domain"] for s in seed_sources.SOURCES],))

    with psycopg.connect(DSN, autocommit=True) as conn:
        first_count = seed_sources.seed(conn)
        second_count = seed_sources.seed(conn)

    assert first_count == len(seed_sources.SOURCES)
    assert second_count == 0

    with psycopg.connect(DSN, autocommit=True) as conn:
        domains = {r[0] for r in conn.execute(
            "SELECT domain FROM sources WHERE domain = ANY(%s)",
            ([s["domain"] for s in seed_sources.SOURCES],),
        )}
        conn.execute("DELETE FROM source_ingestion_state WHERE source_id IN "
                     "(SELECT id FROM sources WHERE domain = ANY(%s))",
                     ([s["domain"] for s in seed_sources.SOURCES],))
        conn.execute("DELETE FROM sources WHERE domain = ANY(%s)",
                     ([s["domain"] for s in seed_sources.SOURCES],))
    assert domains == {s["domain"] for s in seed_sources.SOURCES}
