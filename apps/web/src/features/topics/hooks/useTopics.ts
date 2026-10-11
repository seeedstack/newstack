import { useInfiniteQuery, useQuery } from '@tanstack/react-query'

import { getTopicFeed, listTopics } from '../api'

export function useTopics() {
  return useQuery({ queryKey: ['topics'], queryFn: listTopics })
}

export function useTopicFeed(topicId: string) {
  return useInfiniteQuery({
    queryKey: ['feed', 'topic', topicId],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => getTopicFeed(topicId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })
}
