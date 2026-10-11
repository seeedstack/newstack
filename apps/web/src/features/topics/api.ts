import { apiFetch } from '../../lib/apiClient'
import type { FeedResponse } from '../feed'
import type { Topic } from './types'

export function listTopics(): Promise<Topic[]> {
  return apiFetch<Topic[]>('/api/public/topics')
}

export function getTopicFeed(topicId: string, cursor?: string): Promise<FeedResponse> {
  const query = cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`
  return apiFetch<FeedResponse>(`/api/public/topics/${topicId}/feed${query}`)
}
