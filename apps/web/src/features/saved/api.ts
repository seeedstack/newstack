import { apiFetch } from '../../lib/apiClient'
import type { SavedSource, SavedStory, SavedTopic } from './types'

type Kind = 'sources' | 'stories' | 'topics'

export function listSavedIds(kind: Kind): Promise<{ items: string[] }> {
  return apiFetch<{ items: string[] }>(`/api/me/saved-${kind}`)
}

export function save(kind: Kind, id: string): Promise<void> {
  return apiFetch(`/api/me/saved-${kind}/${id}`, { method: 'PUT' })
}

export function unsave(kind: Kind, id: string): Promise<void> {
  return apiFetch(`/api/me/saved-${kind}/${id}`, { method: 'DELETE' })
}

export function getSource(id: string): Promise<SavedSource> {
  return apiFetch<SavedSource>(`/api/public/sources/${id}`)
}

export function getStoryForSaved(id: string): Promise<SavedStory> {
  return apiFetch<SavedStory>(`/api/public/stories/${id}`)
}

export function listAllTopics(): Promise<SavedTopic[]> {
  return apiFetch<SavedTopic[]>('/api/public/topics')
}
