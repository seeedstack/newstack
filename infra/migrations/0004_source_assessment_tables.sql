-- ARCHITECTURE.md §4 (Data Model), PRODUCT.md §5.6-5.8. Copied verbatim from the doc's schema block.

-- Per-source, per-topic geopolitical positioning. Independent of domestic bias (spectrum 'IN'
-- above): same backward-linked/evidence/confidence shape as source_ratings, but keyed on
-- (source, topic) rather than source alone, since one outlet can carry a rating per topic
-- (PRODUCT §5.6). Absence of a row = never assessed; stance = 'insufficient_evidence' = assessed
-- but below the evidence floor. Direction only (minus/plus); topic-specific pole names are a
-- display concern, not a schema one.
CREATE TABLE source_geo_ratings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id      UUID NOT NULL REFERENCES sources(id),
  topic_code     TEXT NOT NULL CHECK (topic_code IN ('IN_PAK','IN_CHN','IN_US','IN_RUS','IN_NEIGH','DEFSEC','MULTILAT','INDOPAC')),
  stance         TEXT NOT NULL CHECK (stance IN ('strongly_minus','leans_minus','mixed_or_issue_dependent','leans_plus','strongly_plus','insufficient_evidence')),
  confidence     TEXT CHECK (confidence IN ('high','medium','low')),  -- NULL when stance = 'insufficient_evidence'
  method         TEXT NOT NULL,
  method_version TEXT,
  rated_by       TEXT,
  second_rater   TEXT,
  rubric_scores  JSONB,
  evidence       JSONB,
  review_due_at  TIMESTAMPTZ,
  source_ref     TEXT,
  notes          TEXT,
  rated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  supersedes     UUID,
  superseded_at  TIMESTAMPTZ,
  UNIQUE (source_id, id),
  FOREIGN KEY (source_id, supersedes) REFERENCES source_geo_ratings (source_id, id),
  CONSTRAINT geo_manual_needs_two_raters_and_evidence CHECK (
    method <> 'manual-curation' OR (
      rated_by IS NOT NULL AND second_rater IS NOT NULL AND rated_by <> second_rater
      AND rubric_scores IS NOT NULL
      AND jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) >= 3
    )
  )
);
CREATE UNIQUE INDEX idx_source_geo_ratings_one_current  ON source_geo_ratings(source_id, topic_code) WHERE superseded_at IS NULL;
CREATE UNIQUE INDEX idx_source_geo_ratings_linear_chain ON source_geo_ratings(supersedes) WHERE supersedes IS NOT NULL;

-- Per-source sensationalism rating. Independent of factuality; same append-only/backward-linked
-- shape as source_ratings, sized one row per source (not per topic) (PRODUCT §5.7).
CREATE TABLE source_sensationalism_ratings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id      UUID NOT NULL REFERENCES sources(id),
  level          TEXT NOT NULL CHECK (level IN ('low','medium','high','insufficient_evidence')),
  method         TEXT NOT NULL,
  method_version TEXT,
  rated_by       TEXT,
  second_rater   TEXT,
  rubric_scores  JSONB,
  evidence       JSONB,
  review_due_at  TIMESTAMPTZ,
  source_ref     TEXT,
  notes          TEXT,
  rated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  supersedes     UUID,
  superseded_at  TIMESTAMPTZ,
  UNIQUE (source_id, id),
  FOREIGN KEY (source_id, supersedes) REFERENCES source_sensationalism_ratings (source_id, id),
  CONSTRAINT sens_manual_needs_two_raters_and_evidence CHECK (
    method <> 'manual-curation' OR (
      rated_by IS NOT NULL AND second_rater IS NOT NULL AND rated_by <> second_rater
      AND rubric_scores IS NOT NULL
      AND jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) >= 3
    )
  )
);
CREATE UNIQUE INDEX idx_source_sens_ratings_one_current  ON source_sensationalism_ratings(source_id) WHERE superseded_at IS NULL;
CREATE UNIQUE INDEX idx_source_sens_ratings_linear_chain ON source_sensationalism_ratings(supersedes) WHERE supersedes IS NOT NULL;

-- Ownership transparency and editorial independence: a current-state disclosure record, not an
-- append-only revisioned rating like the three tables above (PRODUCT §5.8) — a correction
-- overwrites in place, it doesn't supersede. One row per source, inserted once research begins;
-- absence of a row = not yet researched (mirrors source_ratings' own "no row = not yet rated").
CREATE TABLE source_ownership (
  source_id              UUID PRIMARY KEY REFERENCES sources(id),
  ownership_transparency TEXT NOT NULL CHECK (ownership_transparency IN ('disclosed','partially_disclosed','undisclosed','insufficient_evidence')),
  editorial_independence TEXT NOT NULL CHECK (editorial_independence IN ('no_documented_influence','documented_instances','insufficient_evidence')),
  evidence   JSONB,          -- [{url, archived, dimension: 'ownership'|'editorial_influence', note}, …]
  rated_by   TEXT,
  notes      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
