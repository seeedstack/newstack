import psycopg

import db
from jobs import baseline

DSN = db.DSN


def test_run_returns_none_with_no_ratings():
    """Cold start, zero ratings: the HAVING count(*) > 0 clause means no row is inserted."""
    with psycopg.connect(DSN, autocommit=True) as conn:
        conn.execute("DELETE FROM bias_baselines")
        conn.execute("DELETE FROM source_ratings")
    with psycopg.connect(DSN) as conn:
        result = baseline.run(conn)
    assert result is None


def test_run_uses_pool_method_under_500_appearances():
    with psycopg.connect(DSN, autocommit=True) as conn:
        conn.execute("DELETE FROM bias_baselines")
        conn.execute("DELETE FROM source_ratings")
        for domain, bias in [("l.example", "left"), ("c.example", "center"), ("r.example", "right")]:
            sid = conn.execute(
                "INSERT INTO sources (name, domain, country_code, language, feed_timezone) "
                "VALUES (%s, %s, 'IN', 'en', 'Asia/Kolkata') ON CONFLICT (domain) DO UPDATE "
                "SET name = EXCLUDED.name RETURNING id", (domain, domain),
            ).fetchone()[0]
            conn.execute(
                "INSERT INTO source_ratings (source_id, spectrum, bias_rating, factuality, confidence, "
                "method, rated_by, second_rater, rubric_scores, evidence) VALUES "
                "(%s, 'IN', %s, 'high', 'high', 'manual-curation', 'a', 'b', '{}'::jsonb, "
                "'[{\"url\":\"1\"},{\"url\":\"2\"},{\"url\":\"3\"}]'::jsonb)", (sid, bias),
            )
    with psycopg.connect(DSN) as conn:
        result = baseline.run(conn)
    assert result["method"] == "pool"  # far under the 500-appearances cutover
    assert result["appearances"] == 0  # no article coverage yet, only the rated-source pool
