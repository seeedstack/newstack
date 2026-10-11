import { useMutation, useQuery, useQueries, useQueryClient } from '@tanstack/react-query'

import { useAuthStore } from '../../../lib/authStore'
import { getSource, getStoryForSaved, listAllTopics, listSavedIds, save, unsave } from '../api'

type Kind = 'sources' | 'stories' | 'topics'

function savedIdsKey(kind: Kind) {
  return ['saved', kind] as const
}

// PRODUCT §7.2: anonymous users get a sign-in prompt instead of a 401 — never fire the
// authenticated list call until there's a session.
export function useSavedIds(kind: Kind) {
  const isSignedIn = useAuthStore((s) => s.accessToken !== null)
  return useQuery({
    queryKey: savedIdsKey(kind),
    queryFn: () => listSavedIds(kind).then((r) => r.items),
    enabled: isSignedIn,
  })
}

// Used both on the Saved page and inline wherever a source/story/topic already appears
// (story detail, topic page) — toggling invalidates the one list query that cares.
export function useSavedToggle(kind: Kind) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: savedIdsKey(kind) })
  const saveMutation = useMutation({ mutationFn: (id: string) => save(kind, id), onSuccess: invalidate })
  const unsaveMutation = useMutation({ mutationFn: (id: string) => unsave(kind, id), onSuccess: invalidate })
  return { save: saveMutation, unsave: unsaveMutation }
}

export function useSavedSources() {
  const idsQuery = useSavedIds('sources')
  const ids = idsQuery.data ?? []
  const sourceQueries = useQueries({
    queries: ids.map((id) => ({ queryKey: ['source', id], queryFn: () => getSource(id) })),
  })
  return {
    isLoading: idsQuery.isLoading || sourceQueries.some((q) => q.isLoading),
    error: idsQuery.error ?? sourceQueries.find((q) => q.error)?.error ?? null,
    items: sourceQueries.map((q) => q.data).filter((s) => s !== undefined),
  }
}

export function useSavedStories() {
  const idsQuery = useSavedIds('stories')
  const ids = idsQuery.data ?? []
  const storyQueries = useQueries({
    queries: ids.map((id) => ({ queryKey: ['saved-story', id], queryFn: () => getStoryForSaved(id) })),
  })
  return {
    isLoading: idsQuery.isLoading || storyQueries.some((q) => q.isLoading),
    error: idsQuery.error ?? storyQueries.find((q) => q.error)?.error ?? null,
    items: storyQueries.map((q) => q.data).filter((s) => s !== undefined),
  }
}

export function useSavedTopics() {
  const idsQuery = useSavedIds('topics')
  const topicsQuery = useQuery({ queryKey: ['saved-topics-all'], queryFn: listAllTopics })
  const ids = new Set(idsQuery.data ?? [])
  return {
    isLoading: idsQuery.isLoading || topicsQuery.isLoading,
    error: idsQuery.error ?? topicsQuery.error ?? null,
    items: (topicsQuery.data ?? []).filter((t) => ids.has(t.id)),
  }
}
