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


def test_run_passes_config_values_as_query_params_not_hardcoded():
    """Proves baseline_window_days/pool_cutover_appearances are read from the passed config and
    bound as query parameters, not hardcoded SQL literals -- catches a regression to the old
    `interval '30 days'` / `>= 500` literals even without a full article/story fixture."""
    assert "%(baseline_window_days)s" in baseline.BASELINE_SQL
    assert "%(pool_cutover_appearances)s" in baseline.BASELINE_SQL
    assert "30 days" not in baseline.BASELINE_SQL
    assert ">= 500" not in baseline.BASELINE_SQL

    captured = {}
    real_execute = psycopg.Connection.execute

    def spy_execute(self, query, params=None, **kwargs):
        if params is not None:
            captured.update(params)
        return real_execute(self, query, params, **kwargs)

    with psycopg.connect(DSN, autocommit=True) as conn:
        conn.execute("DELETE FROM bias_baselines")
        conn.execute("DELETE FROM source_ratings")
    with psycopg.connect(DSN) as conn:
        conn.execute = spy_execute.__get__(conn, psycopg.Connection)
        baseline.run(conn, config={"baseline_window_days": 7, "pool_cutover_appearances": 42})
    assert captured["baseline_window_days"] == 7
    assert captured["pool_cutover_appearances"] == 42
