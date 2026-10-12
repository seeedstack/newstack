export interface NewSource {
  name: string
  domain: string
  countryCode: string
  coverageRegion?: string | null
  language: string
  feedTimezone: string
  adapter?: string | null
  rssUrl?: string | null
  logoUrl?: string | null
}

export type BiasRating = 'left' | 'center-left' | 'center' | 'center-right' | 'right'
export type Confidence = 'high' | 'medium' | 'low'

export interface NewRating {
  spectrum?: 'IN' | null
  biasRating?: BiasRating | null
  factuality: 'high' | 'mixed' | 'low'
  confidence?: Confidence | null
  method: string
  methodVersion?: string | null
  ratedBy: string
  secondRater?: string | null
  rubricScores?: Record<string, unknown> | null
  evidence?: string[] | null
  reviewDueAt?: string | null
  sourceRef?: string | null
  notes?: string | null
}

export type ClusterReportKind = 'wrong_merge' | 'should_merge'

export interface NewClusterReport {
  kind: ClusterReportKind
  storyId: string
  articleId?: string
  otherStoryId?: string
  reportedBy: string
}

// Re-exported from the OpenAPI spec (docs/openapi.yaml, generated into packages/shared-types)
// rather than hand-duplicated. NewSource/NewRating/NewClusterReport above stay hand-written:
// NewRating.rubricScores is genuinely free-form JSON, which openapi-typescript renders as
// Record<string, never> (an object that can hold no properties) instead of the usable
// Record<string, unknown> this feature actually needs.
import type { components } from '../../../../../packages/shared-types/src/openapi'

export type BlindspotItem = components['schemas']['BlindspotItem']
export type BlindspotFeedResponse = components['schemas']['BlindspotFeedResponse']
