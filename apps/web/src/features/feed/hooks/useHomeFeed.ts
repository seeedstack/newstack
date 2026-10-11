import { useInfiniteQuery } from '@tanstack/react-query'

import { getHomeFeed } from '../api'

export function useHomeFeed() {
  return useInfiniteQuery({
    queryKey: ['feed', 'home'],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => getHomeFeed(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })
}
