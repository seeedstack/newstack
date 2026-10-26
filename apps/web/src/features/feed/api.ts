import { apiFetch } from '../../lib/apiClient'
import type { FeedResponse, SourceDistribution, StoryDetail } from './types'

export function getHomeFeed(cursor?: string): Promise<FeedResponse> {
  const query = cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`
  return apiFetch<FeedResponse>(`/api/public/feed${query}`)
}

export function getSourceDistribution(): Promise<SourceDistribution> {
  return apiFetch<SourceDistribution>('/api/public/sources/distribution')
}

export function getStoryDetail(id: string): Promise<StoryDetail> {
  return apiFetch<StoryDetail>(`/api/public/stories/${id}`)
}

// Entitled-only, uncapped bias breakdown (PAYPAL_SPEC paywall gate) — see useStoryDetail,
// which only calls this once the public response reports premiumBreakdown.locked.
export function getStoryFullBreakdown(id: string): Promise<StoryDetail> {
  return apiFetch<StoryDetail>(`/api/stories/${id}/full-breakdown`)
}
