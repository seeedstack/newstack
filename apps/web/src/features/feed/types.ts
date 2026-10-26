// Re-exported from the OpenAPI spec (docs/openapi.yaml, generated into
// packages/shared-types) rather than hand-duplicated, so a schema change can't silently
// drift from what this feature assumes the API returns.
import type { components } from '../../../../../packages/shared-types/src/openapi'

export type BiasBarSegment = components['schemas']['BiasBarSegment']
export type BiasBar = components['schemas']['BiasBar']
export type SourceDistribution = components['schemas']['SourceDistribution']
export type FeedItem = components['schemas']['FeedItem']
export type FeedResponse = components['schemas']['FeedResponse']
export type SourceCard = components['schemas']['SourceCard']
export type BiasColumns = components['schemas']['BiasColumns']
// The generated schema predates the paywall gate (docs/openapi.yaml isn't in this repo to
// regenerate from — see packages/shared-types/README.md), so premiumBreakdown is added here
// by hand rather than by running `npm run generate`.
export type StoryDetail = components['schemas']['StoryDetailResponse'] & {
  premiumBreakdown: { locked: boolean; hiddenCardCount: number }
}
