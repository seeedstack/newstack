-- PRODUCT.md §4.6. Not part of 0001 because the migration generator pulled schema only from
-- ARCHITECTURE.md §4 (Data Model) — these two functions live in PRODUCT.md instead, so they
-- were missed. Copied verbatim; must match exactly (CLAUDE.md: kept honest by the same test
-- as the Python implementation in validation/unit, once that exists).

-- One-sided Wilson upper bound. Must match validation/product/blindspot.py exactly.
CREATE FUNCTION wilson_upper(k int, n int, z float8 DEFAULT 1.645) RETURNS float8
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT CASE WHEN n <= 0 THEN 1.0 ELSE
    LEAST(1.0, GREATEST(k::float8 / n,                -- clamp: exact value at k = n is 1
      ((k::float8 / n) + z * z / (2 * n)
       + z * sqrt((k::float8 / n) * (1 - k::float8 / n) / n + z * z / (4.0 * n * n)))
      / (1 + z * z / n))) END
$$;

-- 'R' = little coverage from right-leaning sources, 'L' = from left-leaning, NULL = no flag.
CREATE FUNCTION blindspot_side(k_left int, k_center int, k_right int,
                               p_left float8, p_center float8, p_right float8,
                               n_min int DEFAULT 6, materiality float8 DEFAULT 0.5, z float8 DEFAULT 1.645)
RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT CASE
    WHEN n < n_min THEN NULL
    WHEN k_right::float8 / n <= materiality * p_right AND wilson_upper(k_right, n, z) < p_right
         AND k_left::float8 / n >= p_left  THEN 'R'
    WHEN k_left::float8 / n <= materiality * p_left  AND wilson_upper(k_left, n, z) < p_left
         AND k_right::float8 / n >= p_right THEN 'L'
  END
  FROM (SELECT k_left + k_center + k_right AS n) t
$$;
