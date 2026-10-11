import { useQuery } from '@tanstack/react-query'

import { getStoryDetail } from '../api'

export function useStoryDetail(id: string) {
  return useQuery({
    queryKey: ['story', id],
    queryFn: () => getStoryDetail(id),
  })
}
