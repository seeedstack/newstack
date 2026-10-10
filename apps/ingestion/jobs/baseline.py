"""Daily blindspot baseline (PRODUCT §4.3). Verbatim from the doc — the cold-start
pool/appearances split and the 500-appearance cutover are policy, not reimplemented here."""
from __future__ import annotations

import psycopg

BASELINE_SQL = """
INSERT INTO bias_baselines (spectrum, method, appearances, p_left, p_center, p_right)
WITH app AS (
  SELECT DISTINCT a.story_id, a.source_id,
         CASE WHEN r.bias_rating IN ('left','center-left') THEN 'L'
              WHEN r.bias_rating = 'center' THEN 'C' ELSE 'R' END AS side
  FROM articles a
  JOIN stories s ON s.id = a.story_id AND s.status = 'active' AND s.hidden_at IS NULL
  JOIN source_ratings r ON r.source_id = a.source_id AND r.superseded_at IS NULL
  WHERE a.hidden_at IS NULL AND r.spectrum = 'IN' AND r.confidence <> 'low'
    AND a.coverage_at >= now() - interval '30 days'),
pool AS (
  SELECT CASE WHEN r.bias_rating IN ('left','center-left') THEN 'L'
              WHEN r.bias_rating = 'center' THEN 'C' ELSE 'R' END AS side
  FROM sources src
  JOIN source_ratings r ON r.source_id = src.id AND r.superseded_at IS NULL
  WHERE src.status = 'active' AND r.spectrum = 'IN' AND r.confidence <> 'low'),
pick AS (
  SELECT CASE WHEN (SELECT count(*) FROM app) >= 500 THEN 'appearances' ELSE 'pool' END AS method),
chosen AS (
  SELECT side FROM app  WHERE (SELECT method FROM pick) = 'appearances'
  UNION ALL
  SELECT side FROM pool WHERE (SELECT method FROM pick) = 'pool')
SELECT 'IN', (SELECT method FROM pick), (SELECT count(*) FROM app),
       avg((side = 'L')::int), avg((side = 'C')::int), avg((side = 'R')::int)
FROM chosen
HAVING count(*) > 0
RETURNING method, appearances, p_left, p_center, p_right
"""


def run(conn: psycopg.Connection) -> dict | None:
    with conn.transaction():
        row = conn.execute(BASELINE_SQL).fetchone()
    if row is None:
        return None
    method, appearances, p_left, p_center, p_right = row
    return {"method": method, "appearances": appearances,
            "p_left": p_left, "p_center": p_center, "p_right": p_right}
