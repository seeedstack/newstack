import { curatorFetch } from './lib/curatorFetch'
import type { BlindspotFeedResponse, NewClusterReport, NewRating, NewSource } from './types'

export function onboardSource(input: NewSource): Promise<{ id: string }> {
  return curatorFetch<{ id: string }>('/api/curator/sources', { method: 'POST', body: input })
}

export function createTopic(name: string, keywords: string[], createdBy: string): Promise<{ id: string }> {
  return curatorFetch<{ id: string }>('/api/curator/topics', { method: 'POST', body: { name, keywords, createdBy } })
}

export function hideArticle(id: string, reason: string): Promise<void> {
  return curatorFetch(`/api/curator/articles/${id}/hide`, { method: 'POST', body: { reason } })
}

export function hideStory(id: string): Promise<void> {
  return curatorFetch(`/api/curator/stories/${id}/hide`, { method: 'POST' })
}

export function reportClusterError(input: NewClusterReport): Promise<{ id: string }> {
  return curatorFetch<{ id: string }>('/api/curator/cluster-reports', { method: 'POST', body: input })
}

export function submitRating(sourceId: string, input: NewRating): Promise<unknown> {
  return curatorFetch(`/api/curator/sources/${sourceId}/ratings`, { method: 'POST', body: input })
}

export function setSourceCategories(sourceId: string, categories: string[]): Promise<{ categories: string[] }> {
  return curatorFetch<{ categories: string[] }>(`/api/curator/sources/${sourceId}/categories`, {
    method: 'PUT',
    body: { categories },
  })
}

export function getBlindspotFeed(cursor?: string): Promise<BlindspotFeedResponse> {
  const query = cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`
  return curatorFetch<BlindspotFeedResponse>(`/api/curator/blindspot-feed${query}`)
}
