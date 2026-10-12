-- ARCHITECTURE.md §4 (Data Model), PRODUCT.md §8.1. Copied verbatim from the doc's schema block.

-- First-party analytics (PRODUCT §8.1). Raw rows kept 90 days (§11); daily aggregates are out
-- of scope until something reads them (complexity budget, §1). Deleting an account deletes its
-- events (PRODUCT §8.1 rule), so user_id cascades instead of SET NULL like auth_events.
CREATE TABLE product_events (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event           TEXT NOT NULL CHECK (event IN (
                    'feed_view','story_impression','story_open','article_click',
                    'methodology_view','rating_panel_view','save','follow_source',
                    'follow_topic','signup','cluster_report','rating_concern')),
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),  -- server receive time; client clocks ignored
  session_id      UUID NOT NULL,
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  client_event_id UUID NOT NULL,                       -- sendBeacon retry dedup key (§8.1 rule 2)
  story_id        UUID REFERENCES stories(id),
  source_id       UUID REFERENCES sources(id),
  topic_id        UUID REFERENCES topics(id),
  feed            TEXT,
  position        INT,
  sides_available INT,
  source_side     TEXT CHECK (source_side IN ('L','C','R','unrated'))
);
CREATE UNIQUE INDEX idx_product_events_client_event_id ON product_events(client_event_id);
CREATE INDEX idx_product_events_session_story ON product_events(session_id, story_id, event, occurred_at);
CREATE INDEX idx_product_events_occurred_at ON product_events(occurred_at);
