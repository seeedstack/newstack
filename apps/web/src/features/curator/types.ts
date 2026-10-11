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

export interface BlindspotItem {
  id: string
  title: string
  lastCoverageAt: string
  side: 'L' | 'R'
  countedLeft: number
  countedCenter: number
  countedRight: number
}

export interface BlindspotFeedResponse {
  items: BlindspotItem[]
  asOf: string
  nextCursor: string | null
}
