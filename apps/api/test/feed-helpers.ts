// Fixtures for feed/topic/blindspot tests. Mirrors the real ingestion write order (clustering
// apply.py): an article is created first with no story, then a new story is created pointing
// at it as headline_article_id, then the article is updated to point back at the story —
// because stories.headline_article_id and articles.story_id each need the other to exist.
//
// No cleanup here: stories can never be hard-deleted once active (`stories_no_delete` trigger
// — only 'building' stories may be deleted, and the feed only reads 'active' ones, so a
// 'building' fixture would be invisible to the thing under test anyway), and sources/articles
// have NOT NULL FKs with no cascade once referenced. This matches the schema's own stance
// (§11: "Content: sources, articles, stories, ratings — indefinite" retention) — fixtures are
// real, permanent rows, so every call below generates its own unique domain/title/url instead
// of trying to reuse or delete anything.
import { getPool } from "../src/db.js";

const ZERO_VECTOR = `[${Array(384).fill(0).join(",")}]`;
let counter = 0;

function uniqueSuffix(): string {
  counter += 1;
  return `${Date.now()}-${counter}`;
}

export async function createTestSource(label: string): Promise<string> {
  const domain = `${label}-${uniqueSuffix()}.example`;
  const result = await getPool().query<{ id: string }>(
    `INSERT INTO sources (name, domain, country_code, coverage_region, language, feed_timezone)
     VALUES ($1, $1, 'IN', 'domestic', 'en', 'Asia/Kolkata')
     RETURNING id`,
    [domain]
  );
  return result.rows[0].id;
}

export async function rateSource(
  sourceId: string,
  opts: { biasRating?: string | null; confidence?: string | null; factualityOnly?: boolean }
): Promise<void> {
  const spectrum = opts.factualityOnly ? null : "IN";
  const biasRating = opts.factualityOnly ? null : opts.biasRating ?? "center";
  // method='internal-classifier-v1', not 'manual-curation' — the latter requires a second
  // rater, rubric scores and ≥3 evidence entries (manual_needs_two_raters_and_evidence).
  await getPool().query(
    `INSERT INTO source_ratings (source_id, spectrum, bias_rating, factuality, confidence, method, rated_by)
     VALUES ($1, $2, $3, 'high', $4, 'internal-classifier-v1', 'test')`,
    [sourceId, spectrum, biasRating, opts.confidence ?? "high"]
  );
}

async function insertArticle(
  sourceId: string,
  opts: {
    storyId: string | null;
    effectiveAt: Date;
    hiddenAt?: Date | null;
    clusterVersion?: string;
    title?: string;
    contentHash?: string;
  }
): Promise<string> {
  const suffix = uniqueSuffix();
  const embedded = opts.storyId !== null; // I1: embedding/embedding_model/embedded_content_hash are null together
  const hiddenAt = opts.hiddenAt ?? null;
  const contentHash = opts.contentHash ?? `hash-${suffix}`;
  const result = await getPool().query<{ id: string }>(
    `INSERT INTO articles (
       source_id, title, url, canonical_url, canonicalization_version, content_hash,
       effective_at, first_scraped_at, embedding, embedding_model, embedded_content_hash,
       story_id, cluster_version, hidden_at, hidden_reason
     ) VALUES ($1, $2, $3, $3, 'c1', $4, $5, $5, $6::vector, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      sourceId,
      opts.title ?? `Test article ${suffix}`,
      `example.test/${suffix}`,
      contentHash,
      opts.effectiveAt,
      embedded ? ZERO_VECTOR : null,
      embedded ? "test-model" : null,
      embedded ? contentHash : null,
      opts.storyId,
      embedded ? opts.clusterVersion ?? "test-v1" : null,
      hiddenAt,
      hiddenAt === null ? null : "takedown", // (hidden_at IS NULL) = (hidden_reason IS NULL)
    ]
  );
  return result.rows[0].id;
}

export async function createTestStory(
  sourceId: string,
  opts: { title?: string; lastCoverageAt?: Date; clusterVersion?: string } = {}
): Promise<{ storyId: string; headlineArticleId: string }> {
  const clusterVersion = opts.clusterVersion ?? "test-v1";
  const effectiveAt = opts.lastCoverageAt ?? new Date();
  const headlineArticleId = await insertArticle(sourceId, { storyId: null, effectiveAt });

  const story = await getPool().query<{ id: string }>(
    `INSERT INTO stories (
       title, summary, headline_article_id, representative_embedding, representative_embedding_model,
       cluster_version, status, first_seen_at, event_last_updated_at, last_coverage_at
     ) VALUES ($1, 'test summary', $2, $3::vector, 'test-model', $4, 'active', $5, $5, $5)
     RETURNING id`,
    [opts.title ?? `Test story ${uniqueSuffix()}`, headlineArticleId, ZERO_VECTOR, clusterVersion, effectiveAt]
  );
  const storyId = story.rows[0].id;

  // Must flip story_id and embedding/embedding_model/embedded_content_hash together — I1
  // requires them null (or not) in lockstep, and before this the headline article had none.
  await getPool().query(
    `UPDATE articles
     SET story_id = $1, cluster_version = $2, embedding = $3::vector,
         embedding_model = 'test-model', embedded_content_hash = content_hash
     WHERE id = $4`,
    [storyId, clusterVersion, ZERO_VECTOR, headlineArticleId]
  );

  return { storyId, headlineArticleId };
}

// Adds another source's coverage to an existing story (for multi-source bias-bar tests).
export async function addCoverage(
  storyId: string,
  sourceId: string,
  opts: { effectiveAt?: Date; hiddenAt?: Date | null; clusterVersion?: string; title?: string; contentHash?: string } = {}
): Promise<string> {
  return insertArticle(sourceId, {
    storyId,
    effectiveAt: opts.effectiveAt ?? new Date(),
    hiddenAt: opts.hiddenAt,
    clusterVersion: opts.clusterVersion,
    title: opts.title,
    contentHash: opts.contentHash,
  });
}

// §6: redirect a story to its successor. 'stories_guard' requires the target be active.
export async function tombstoneStory(storyId: string, mergedIntoId: string): Promise<void> {
  await getPool().query(
    "UPDATE stories SET status = 'tombstoned', tombstoned_at = now(), merged_into = $2 WHERE id = $1",
    [storyId, mergedIntoId]
  );
}

export async function insertLineage(oldStoryId: string, newStoryId: string, articleCount: number): Promise<void> {
  await getPool().query(
    "INSERT INTO story_lineage (old_story_id, new_story_id, article_count) VALUES ($1, $2, $3)",
    [oldStoryId, newStoryId, articleCount]
  );
}

// Raw insert — bypasses the §10 write-side keyword normalization (curator-only, not built
// yet); fine for testing the read-side matching, which is all this is used for.
export async function createTestTopic(name: string, keywords: string[]): Promise<string> {
  const result = await getPool().query<{ id: string }>(
    "INSERT INTO topics (name, keywords, created_by) VALUES ($1, $2, 'test') RETURNING id",
    [`${name} ${uniqueSuffix()}`, keywords]
  );
  return result.rows[0].id;
}
