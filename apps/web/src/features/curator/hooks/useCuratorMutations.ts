import { useInfiniteQuery, useMutation } from '@tanstack/react-query'

import {
  createTopic,
  getBlindspotFeed,
  hideArticle,
  hideStory,
  onboardSource,
  reportClusterError,
  setSourceCategories,
  submitRating,
} from '../api'
import type { NewClusterReport, NewRating, NewSource } from '../types'

export function useOnboardSource() {
  return useMutation({ mutationFn: (input: NewSource) => onboardSource(input) })
}

export function useCreateTopic() {
  return useMutation({
    mutationFn: ({ name, keywords, createdBy }: { name: string; keywords: string[]; createdBy: string }) =>
      createTopic(name, keywords, createdBy),
  })
}

export function useHideArticle() {
  return useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => hideArticle(id, reason) })
}

export function useHideStory() {
  return useMutation({ mutationFn: (id: string) => hideStory(id) })
}

export function useReportClusterError() {
  return useMutation({ mutationFn: (input: NewClusterReport) => reportClusterError(input) })
}

export function useSubmitRating() {
  return useMutation({ mutationFn: ({ sourceId, input }: { sourceId: string; input: NewRating }) => submitRating(sourceId, input) })
}

export function useSetSourceCategories() {
  return useMutation({
    mutationFn: ({ sourceId, categories }: { sourceId: string; categories: string[] }) => setSourceCategories(sourceId, categories),
  })
}

export function useBlindspotFeed() {
  return useInfiniteQuery({
    queryKey: ['curator', 'blindspot'],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => getBlindspotFeed(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })
}
