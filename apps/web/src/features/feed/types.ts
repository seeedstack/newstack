export interface BiasBarSegment {
  count: number
  lowConfidenceCount: number
}

export interface BiasBar {
  left: BiasBarSegment
  centerLeft: BiasBarSegment
  center: BiasBarSegment
  centerRight: BiasBarSegment
  right: BiasBarSegment
  notRated: BiasBarSegment
}

export interface FeedItem {
  id: string
  title: string
  summary: string | null
  lastCoverageAt: string
  ratedSourceCount: number
  unratedSourceCount: number
  biasBar: BiasBar
}

export interface FeedResponse {
  items: FeedItem[]
  asOf: string
  nextCursor: string | null
  updatedCount: number
}

export interface SourceCard {
  sourceId: string
  sourceName: string
  primaryArticle: { id: string; title: string; url: string; publishedAt: string | null }
  moreCount: number
}

export interface BiasColumns {
  left: SourceCard[]
  centerLeft: SourceCard[]
  center: SourceCard[]
  centerRight: SourceCard[]
  right: SourceCard[]
  notRated: SourceCard[]
}

export interface StoryDetail {
  id: string
  title: string
  summary: string | null
  status: 'building' | 'active' | 'tombstoned'
  redirectTo: { id: string; title: string } | null
  splitNotices: { storyId: string; title: string; articleCount: number }[]
  ratedSourceCount: number
  unratedSourceCount: number
  biasColumns: BiasColumns
}
