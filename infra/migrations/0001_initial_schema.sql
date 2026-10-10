-- GENERATED from docs/ARCHITECTURE.md §4 by infra/generate_migration_0001.py. Do not hand-edit.
CREATE EXTENSION IF NOT EXISTS vector;

-- ───────────────────────── Sources ─────────────────────────
-- Outlets. Deprecated, never deleted.
CREATE TABLE sources (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  domain            TEXT UNIQUE NOT NULL,
  country_code      TEXT NOT NULL,            -- ISO 3166 alpha-2: 'IN', 'US', 'GB'
  coverage_region   TEXT,                     -- 'domestic' | 'global'
  language          TEXT NOT NULL,            -- ISO 639-1 of the feed: 'en', 'ta', 'hi'
  feed_timezone     TEXT NOT NULL CHECK (feed_timezone <> ''), -- IANA zone for naive timestamps; NO default
  adapter           TEXT NOT NULL DEFAULT 'generic',  -- config/sources/<adapter>.yaml (§5)
  stale_after_hours INT  NOT NULL DEFAULT 24 CHECK (stale_after_hours > 0), -- alert if no new item for this long
  rss_url           TEXT,
  logo_url          TEXT,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deprecated')),
  deprecated_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'deprecated') = (deprecated_at IS NOT NULL))
);

-- Bias/factuality rating with provenance. Append-only, BACKWARD-linked. A rating names a
-- spectrum only when it carries a bias judgment: NULL together = factuality-only (international
-- outlets, PRODUCT §3.2). confidence is the bias methodology's reconciliation outcome (PRODUCT
-- §5.2) and is NULL for factuality-only ratings.
CREATE TABLE source_ratings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id      UUID NOT NULL REFERENCES sources(id),
  spectrum       TEXT CHECK (spectrum IN ('IN')),  -- one MVP spectrum; NULL = factuality-only
  bias_rating    TEXT CHECK (bias_rating IN ('left','center-left','center','center-right','right')),
  factuality     TEXT NOT NULL CHECK (factuality IN ('high','mixed','low')),
  confidence     TEXT CHECK (confidence IN ('high','medium','low')),
  -- Independent dimensions (orientation vs reliability). Never combine into one score.
  method         TEXT NOT NULL,              -- 'manual-curation' | 'licensed-allsides' | 'internal-classifier-v1'
  method_version TEXT,                       -- rubric/classifier version, e.g. 'rubric-v1' (PRODUCT §5.1)
  rated_by       TEXT,                       -- first/only rater
  second_rater   TEXT,                       -- manual-curation's second rater; NULL otherwise
  rubric_scores  JSONB,                      -- per-rater dimension scores, D5 tally, factuality inputs (PRODUCT §5.1)
  evidence       JSONB,                      -- [{url, archived, dimension, note}, …]; ≥ 3 for manual curation
  review_due_at  TIMESTAMPTZ,                -- next required review (PRODUCT §5.4)
  source_ref     TEXT,                       -- ratings-repo merge commit SHA, or a licence reference
  notes          TEXT,
  rated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  supersedes    UUID,                       -- previous rating; NULL for a source's first rating
  superseded_at TIMESTAMPTZ,                -- NULL = current rating
  UNIQUE (source_id, id),
  FOREIGN KEY (source_id, supersedes) REFERENCES source_ratings (source_id, id), -- same-source chains only
  CONSTRAINT bias_needs_spectrum CHECK ((bias_rating IS NULL) = (spectrum IS NULL)),
  CONSTRAINT manual_needs_two_raters_and_evidence CHECK (
    method <> 'manual-curation' OR (
      rated_by IS NOT NULL AND second_rater IS NOT NULL AND rated_by <> second_rater
      AND rubric_scores IS NOT NULL
      AND jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) >= 3
    )
  )
);
CREATE UNIQUE INDEX idx_source_ratings_one_current  ON source_ratings(source_id)  WHERE superseded_at IS NULL;
CREATE UNIQUE INDEX idx_source_ratings_linear_chain ON source_ratings(supersedes) WHERE supersedes IS NOT NULL;

-- Daily blindspot baseline: one row per run. The row in force at `as_of` is the latest
-- `computed_at <= as_of`, so a feed scroll never sees the baseline change mid-scroll (PRODUCT §4.3).
CREATE TABLE bias_baselines (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  spectrum    TEXT NOT NULL,
  method      TEXT NOT NULL CHECK (method IN ('appearances','pool')),
  appearances BIGINT NOT NULL CHECK (appearances >= 0),
  p_left      FLOAT8 NOT NULL CHECK (p_left   BETWEEN 0 AND 1),
  p_center    FLOAT8 NOT NULL CHECK (p_center BETWEEN 0 AND 1),
  p_right     FLOAT8 NOT NULL CHECK (p_right  BETWEEN 0 AND 1),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bias_baselines_lookup ON bias_baselines(spectrum, computed_at DESC);

-- Per-source ingestion state. Row created by trigger.
CREATE TABLE source_ingestion_state (
  source_id             UUID PRIMARY KEY REFERENCES sources(id),
  poll_interval_minutes INT NOT NULL DEFAULT 15 CHECK (poll_interval_minutes >= 5),
  last_attempted_at     TIMESTAMPTZ,
  last_success_at       TIMESTAMPTZ,
  last_new_item_at      TIMESTAMPTZ,              -- last run that inserted ≥ 1 new article
  etag                  TEXT,
  last_modified         TEXT,
  failure_count         INT NOT NULL DEFAULT 0,  -- consecutive failed RUNS
  zero_items_streak     INT NOT NULL DEFAULT 0,  -- consecutive successful runs with 0 items parsed
  last_error            TEXT,
  next_attempt_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  status                TEXT NOT NULL DEFAULT 'healthy' CHECK (status IN ('healthy','degraded','failing'))
);

CREATE FUNCTION init_source_ingestion_state() RETURNS trigger AS $$
BEGIN
  INSERT INTO source_ingestion_state (source_id) VALUES (NEW.id);
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_sources_init_state AFTER INSERT ON sources
  FOR EACH ROW EXECUTE FUNCTION init_source_ingestion_state();

-- One row per fetch run: flakiness, anomalies, lag. Retained 14 days (§11).
CREATE TABLE ingestion_runs (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id      UUID NOT NULL REFERENCES sources(id),
  started_at     TIMESTAMPTZ NOT NULL,
  finished_at    TIMESTAMPTZ NOT NULL,
  outcome        TEXT NOT NULL CHECK (outcome IN ('ok','not_modified','failed')),
  http_status    INT,
  items_seen     INT NOT NULL DEFAULT 0,
  items_new      INT NOT NULL DEFAULT 0,
  items_rejected INT NOT NULL DEFAULT 0,
  error          TEXT
);
CREATE INDEX idx_ingestion_runs_source_time ON ingestion_runs(source_id, started_at DESC);

-- ───────────────────────── Stories ─────────────────────────
-- Never hard-deleted once active: emptied stories are tombstoned (§6).
-- 'building' stories exist only during an epoch rebuild and are invisible everywhere (§7).
CREATE TABLE stories (
  id                             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                          TEXT NOT NULL,          -- headline_article's title
  summary                        TEXT,                   -- headline_article's excerpt
  headline_article_id            UUID NOT NULL,          -- founding article; replaced automatically if it is hidden (I13)
  representative_embedding       VECTOR(384) NOT NULL,   -- founding article's embedding, frozen
  representative_embedding_model TEXT NOT NULL,
  cluster_version                TEXT NOT NULL,          -- clustering epoch that owns this story
  status                         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('building','active','tombstoned')),
  merged_into                    UUID REFERENCES stories(id),  -- primary successor (§6)
  tombstoned_at                  TIMESTAMPTZ,
  hidden_at                      TIMESTAMPTZ,            -- curator: removed from feeds (takedown)
  -- Two clocks (§6). Maintained only by the articles trigger below; monotonic.
  first_seen_at                  TIMESTAMPTZ NOT NULL,   -- EVENT: earliest effective_at assigned
  event_last_updated_at          TIMESTAMPTZ NOT NULL,   -- EVENT: latest effective_at assigned
  last_coverage_at               TIMESTAMPTZ NOT NULL,   -- FEED: latest coverage_at assigned
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, cluster_version),                          -- target of the articles composite FK
  CHECK ((status = 'tombstoned') = (tombstoned_at IS NOT NULL)),
  CHECK ((status = 'tombstoned') = (merged_into IS NOT NULL)),
  CHECK (merged_into IS NULL OR merged_into <> id),
  CHECK (first_seen_at <= event_last_updated_at),
  CHECK (event_last_updated_at <= last_coverage_at)
);

-- I8/I10: clocks monotonic; lifecycle building → active → tombstoned only; redirects point at
-- an ACTIVE story and never change (so chains are acyclic); a story never changes epoch.
CREATE FUNCTION stories_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.event_last_updated_at < OLD.event_last_updated_at OR NEW.last_coverage_at < OLD.last_coverage_at
     OR NEW.first_seen_at > OLD.first_seen_at THEN
    RAISE EXCEPTION 'I8: story clocks are monotonic';
  END IF;
  IF NEW.cluster_version <> OLD.cluster_version THEN
    RAISE EXCEPTION 'a story never changes epoch';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
       (OLD.status = 'building' AND NEW.status = 'active') OR
       (OLD.status = 'active'   AND NEW.status = 'tombstoned')) THEN
    RAISE EXCEPTION 'illegal story transition % → %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'tombstoned' AND NEW.merged_into IS DISTINCT FROM OLD.merged_into THEN
    RAISE EXCEPTION 'a tombstone''s redirect is immutable';
  END IF;
  IF OLD.status = 'active' AND NEW.status = 'tombstoned'
     AND (SELECT status FROM stories WHERE id = NEW.merged_into) IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'tombstone must redirect to an active story';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_stories_guard BEFORE UPDATE ON stories
  FOR EACH ROW EXECUTE FUNCTION stories_guard();

CREATE FUNCTION stories_no_delete() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'building' THEN
    RAISE EXCEPTION 'only building stories may be deleted (epoch rebuild abort)';
  END IF;
  RETURN OLD;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_stories_no_delete BEFORE DELETE ON stories
  FOR EACH ROW EXECUTE FUNCTION stories_no_delete();

-- Where a story's articles went. One row per (old, new) pair, counting moved articles.
-- Resolves splits: merged_into is the primary successor; the others are "also continued in".
CREATE TABLE story_lineage (
  old_story_id  UUID NOT NULL REFERENCES stories(id),
  new_story_id  UUID NOT NULL REFERENCES stories(id),
  article_count INT  NOT NULL CHECK (article_count > 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (old_story_id, new_story_id),
  CHECK (old_story_id <> new_story_id)
);

-- Active clustering epoch. One row. T3 reads it FOR SHARE; cutover updates it (§7).
CREATE TABLE clustering_state (
  singleton              BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
  active_cluster_version TEXT NOT NULL,
  embedding_model        TEXT NOT NULL,          -- '<name>@<revision>'
  embed_input_version    TEXT NOT NULL,
  activated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────── Articles ─────────────────────────
CREATE TABLE articles (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id                UUID NOT NULL REFERENCES sources(id),
  title                    TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 1000),
  url                      TEXT NOT NULL,          -- as published; the ONLY url ever shown as a link
  canonical_url            TEXT NOT NULL,          -- identity key, scheme-less (§5 canonical URLs); never a link
  canonicalization_version TEXT NOT NULL,          -- 'c1'
  guid                     TEXT,                   -- RSS guid, diagnostics only (publishers reuse/rotate guids)
  content_hash             TEXT NOT NULL,          -- '<input_version>:' || sha256(EXACT embedder input). Always current
  embedded_content_hash    TEXT,                   -- content_hash of the input the stored vector was computed from
  skip_reason              TEXT CHECK (skip_reason IN ('unsupported_language')),
  embed_attempts           INT NOT NULL DEFAULT 0 CHECK (embed_attempts >= 0), -- failures for the CURRENT content_hash
  last_embed_attempt_at    TIMESTAMPTZ,
  last_embed_error         TEXT,
  author                   TEXT,
  excerpt                  TEXT CHECK (char_length(excerpt) <= 5000),
  image_url                TEXT CHECK (image_url ~ '^https://' AND char_length(image_url) <= 2048),
  language                 TEXT,
  section                  TEXT,
  published_at             TIMESTAMPTZ,            -- as claimed by the publisher; may be NULL or wrong
  first_scraped_at         TIMESTAMPTZ NOT NULL DEFAULT now(), -- IMMUTABLE (trigger)
  last_fetched_at          TIMESTAMPTZ NOT NULL DEFAULT now(), -- every re-fetch; ingestion health only
  effective_at             TIMESTAMPTZ NOT NULL,   -- LEAST(COALESCE(published_at, first_scraped_at), first_scraped_at)
  -- Coverage time (§6): prompt ingestion counts as fresh coverage; backlog never bumps past its own time.
  -- Changing the 48 h window is a schema migration, so the rule has exactly one implementation.
  coverage_at              TIMESTAMPTZ GENERATED ALWAYS AS (
                             CASE WHEN first_scraped_at - effective_at <= interval '48 hours'
                                  THEN first_scraped_at ELSE effective_at END) STORED,
  embedding                VECTOR(384),
  embedding_model          TEXT,
  story_id                 UUID,
  cluster_version          TEXT,                   -- epoch of the CURRENT assignment; must equal the story's
  hidden_at                TIMESTAMPTZ,            -- curator takedown / duplicate; excluded everywhere user-facing
  hidden_reason            TEXT CHECK (hidden_reason IN ('takedown','spam','duplicate','canonical_duplicate')),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, canonical_url),
  FOREIGN KEY (story_id, cluster_version) REFERENCES stories (id, cluster_version), -- no mixed-epoch stories
  CHECK ((embedding IS NULL) = (embedded_content_hash IS NULL)),  -- I1
  CHECK ((embedding IS NULL) = (embedding_model IS NULL)),        -- I1
  CHECK ((embedding IS NULL) = (story_id IS NULL)),               -- I2: embedded ⇔ clustered
  CHECK ((embedding IS NULL) = (cluster_version IS NULL)),        -- I2
  CHECK (skip_reason IS NULL OR embedding IS NULL),               -- I7
  CHECK (effective_at <= first_scraped_at),
  CHECK ((hidden_at IS NULL) = (hidden_reason IS NULL))
);

-- I9: first_scraped_at immutable. I11: an article never joins a tombstoned story.
CREATE FUNCTION articles_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.first_scraped_at IS DISTINCT FROM OLD.first_scraped_at THEN
    RAISE EXCEPTION 'first_scraped_at is immutable';
  END IF;
  IF NEW.story_id IS DISTINCT FROM OLD.story_id AND NEW.story_id IS NOT NULL
     AND (SELECT status FROM stories WHERE id = NEW.story_id) = 'tombstoned' THEN
    RAISE EXCEPTION 'I11: cannot assign an article to a tombstoned story';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_articles_guard BEFORE UPDATE ON articles
  FOR EACH ROW EXECUTE FUNCTION articles_guard();

-- I12: story clocks are maintained here and nowhere else. Fires when a visible article joins a story
-- (assignment, move, cutover) or when a clustered article's time is corrected by the publisher —
-- the latter needs no re-embed (§6 "timestamp corrections"). Hidden articles never move a clock.
CREATE FUNCTION articles_story_clocks() RETURNS trigger AS $$
BEGIN
  UPDATE stories
     SET first_seen_at         = LEAST(first_seen_at, NEW.effective_at),
         event_last_updated_at = GREATEST(event_last_updated_at, NEW.effective_at),
         last_coverage_at      = GREATEST(last_coverage_at, NEW.coverage_at)
   WHERE id = NEW.story_id;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_articles_story_clocks AFTER UPDATE OF story_id, effective_at ON articles
  FOR EACH ROW WHEN (NEW.story_id IS NOT NULL AND NEW.hidden_at IS NULL AND
                     (OLD.story_id IS DISTINCT FROM NEW.story_id OR OLD.effective_at IS DISTINCT FROM NEW.effective_at))
  EXECUTE FUNCTION articles_story_clocks();

ALTER TABLE stories ADD FOREIGN KEY (headline_article_id) REFERENCES articles(id);

-- I13: what a visible story shows is never taken-down content.
--   · the headline article is hidden → headline switches to the newest visible member
--   · members remain but none is visible → the story leaves feeds (hidden_at)
-- Fires on takedowns and on moves, so a move that leaves only hidden members is covered too.
CREATE FUNCTION articles_visibility() RETURNS trigger AS $$
DECLARE sid uuid;
BEGIN
  FOREACH sid IN ARRAY ARRAY[OLD.story_id, NEW.story_id] LOOP
    CONTINUE WHEN sid IS NULL;
    UPDATE stories st
       SET (title, summary, headline_article_id) =
           (SELECT a.title, a.excerpt, a.id FROM articles a
             WHERE a.story_id = st.id AND a.hidden_at IS NULL
             ORDER BY a.effective_at DESC, a.id LIMIT 1)
     WHERE st.id = sid AND st.status <> 'tombstoned'
       AND EXISTS (SELECT 1 FROM articles h WHERE h.id = st.headline_article_id AND h.hidden_at IS NOT NULL)
       AND EXISTS (SELECT 1 FROM articles a WHERE a.story_id = st.id AND a.hidden_at IS NULL);
    UPDATE stories st SET hidden_at = now()
     WHERE st.id = sid AND st.status = 'active' AND st.hidden_at IS NULL
       AND EXISTS (SELECT 1 FROM articles a WHERE a.story_id = st.id)
       AND NOT EXISTS (SELECT 1 FROM articles a WHERE a.story_id = st.id AND a.hidden_at IS NULL);
  END LOOP;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_articles_visibility AFTER UPDATE OF hidden_at, story_id ON articles
  FOR EACH ROW WHEN (OLD.hidden_at IS DISTINCT FROM NEW.hidden_at OR OLD.story_id IS DISTINCT FROM NEW.story_id)
  EXECUTE FUNCTION articles_visibility();

-- Staging for an epoch rebuild (§7). Empty outside a rebuild.
CREATE TABLE epoch_build (
  article_id            UUID PRIMARY KEY REFERENCES articles(id),
  old_story_id          UUID NOT NULL REFERENCES stories(id),
  new_story_id          UUID NOT NULL,
  cluster_version       TEXT NOT NULL,
  embedding             VECTOR(384) NOT NULL,
  embedding_model       TEXT NOT NULL,
  embedded_content_hash TEXT NOT NULL,
  FOREIGN KEY (new_story_id, cluster_version) REFERENCES stories (id, cluster_version)
);

-- Curator-reported clustering errors: the false-merge / false-split signal (§7).
CREATE TABLE cluster_reports (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN ('wrong_merge','should_merge')),
  story_id        UUID NOT NULL REFERENCES stories(id),
  article_id      UUID REFERENCES articles(id),   -- wrong_merge: the article that doesn't belong
  other_story_id  UUID REFERENCES stories(id),    -- should_merge: the story it duplicates
  cluster_version TEXT NOT NULL,
  reported_by     TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ
);

-- ───────────────────────── Users & auth ─────────────────────────
CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT NOT NULL,
  password_hash     TEXT NOT NULL,              -- argon2id
  email_verified_at TIMESTAMPTZ,
  auth_version      BIGINT NOT NULL DEFAULT 1,  -- JWT claim `av` must equal this; bump to kill all access tokens
  last_login_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_users_email_lower ON users(lower(email));

-- Refresh tokens. BACKWARD-linked (parent_id) so a lost-response retry can branch.
-- parent_id is SET NULL on delete: cleaning up an expired parent must never delete a live child.
CREATE TABLE refresh_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id   UUID NOT NULL,
  parent_id   UUID REFERENCES refresh_sessions(id) ON DELETE SET NULL,
  token_hash  TEXT NOT NULL,                    -- SHA-256 of a 256-bit random token
  issued_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  rotated_at  TIMESTAMPTZ,                      -- first time this token was exchanged
  revoked_at  TIMESTAMPTZ
);
CREATE UNIQUE INDEX idx_refresh_sessions_token_hash ON refresh_sessions(token_hash);
CREATE INDEX idx_refresh_sessions_family  ON refresh_sessions(family_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_refresh_sessions_user    ON refresh_sessions(user_id)   WHERE revoked_at IS NULL;
CREATE INDEX idx_refresh_sessions_parent  ON refresh_sessions(parent_id);
CREATE INDEX idx_refresh_sessions_expires ON refresh_sessions(expires_at);

CREATE TABLE password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,              -- created_at + 30 min
  used_at    TIMESTAMPTZ
);
CREATE UNIQUE INDEX idx_password_reset_tokens_token_hash ON password_reset_tokens(token_hash);

CREATE TABLE email_verification_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,              -- created_at + 24 h
  used_at    TIMESTAMPTZ
);
CREATE UNIQUE INDEX idx_email_verification_tokens_hash ON email_verification_tokens(token_hash);

-- Transactional outbox. Holds INTENT only: no address, no token. The mailer reads the address and
-- mints the token at send time, so no raw token is ever stored (§9 email).
CREATE TABLE email_outbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('verify_email','password_reset','account_exists')),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  attempts        INT  NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ
);
CREATE INDEX idx_email_outbox_due ON email_outbox(next_attempt_at) WHERE status = 'pending';

-- Why was I logged out? One row per auth decision. Retained 90 days (§11).
CREATE TABLE auth_events (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  family_id  UUID,
  event      TEXT NOT NULL CHECK (event IN (
               'signup','login_ok','login_fail','refresh_rotate','refresh_grace','refresh_reuse_revoked',
               'refresh_rejected','logout','logout_all','password_changed','password_reset',
               'email_verified','access_version_mismatch','account_deleted')),
  reason     TEXT,
  ip         INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_auth_events_user ON auth_events(user_id, created_at DESC);

-- Deleted account ids, kept 35 days so a backup restore can re-apply deletions (§11).
CREATE TABLE account_deletions (
  user_id    UUID PRIMARY KEY,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────── Personalization ─────────────────────────
-- Topics are GLOBAL, curator-defined. Users save them; users never create them at MVP.
CREATE TABLE topics (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  keywords   TEXT[] NOT NULL CHECK (cardinality(keywords) BETWEEN 1 AND 20), -- normalized on write
  created_by TEXT NOT NULL,                     -- curator id
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The one implementation of keyword → regex. API and tests both call it, so they cannot drift.
-- Boundaries are explicit alnum classes (not \m \M), so keywords like "C++" and "COVID-19" work.
CREATE FUNCTION topic_pattern(kw TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT '(^|[^[:alnum:]_])'
      || regexp_replace(regexp_replace(kw, '([^[:alnum:][:space:]])', '\\\1', 'g'),
                        '[[:space:]]+', '[[:space:]]+', 'g')
      || '($|[^[:alnum:]_])'
$$;

CREATE TABLE user_saved_sources (
  user_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  source_id UUID REFERENCES sources(id),
  PRIMARY KEY (user_id, source_id)
);
CREATE TABLE user_saved_stories (
  user_id  UUID REFERENCES users(id) ON DELETE CASCADE,
  story_id UUID REFERENCES stories(id),
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, story_id)
);
CREATE TABLE user_saved_topics (
  user_id  UUID REFERENCES users(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, topic_id)
);

-- ───────────────────────── Indexes ─────────────────────────
CREATE INDEX idx_articles_published_at ON articles(published_at DESC);
CREATE INDEX idx_articles_story_id     ON articles(story_id);
CREATE INDEX idx_articles_source_hash  ON articles(source_id, content_hash);  -- URL-churn detection (§5)
-- Retry sweeper (§8): exactly the I3 predicate.
CREATE INDEX idx_articles_needs_embed  ON articles(last_embed_attempt_at NULLS FIRST, effective_at DESC)
  WHERE embedded_content_hash IS DISTINCT FROM content_hash AND embed_attempts < 5
    AND skip_reason IS NULL AND hidden_at IS NULL;
-- Clustering candidates (event time) and feed ordering (coverage time).
CREATE INDEX idx_stories_candidates ON stories(cluster_version, event_last_updated_at DESC) WHERE status = 'active';
CREATE INDEX idx_stories_feed       ON stories(last_coverage_at DESC, id DESC)
  WHERE status = 'active' AND hidden_at IS NULL;
CREATE INDEX idx_ingestion_next_attempt ON source_ingestion_state(next_attempt_at);
-- No vector index on articles.embedding at MVP. Add HNSW when semantic search ships.
