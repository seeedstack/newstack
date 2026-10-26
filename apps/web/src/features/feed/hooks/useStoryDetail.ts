import { useQuery } from '@tanstack/react-query'

import { useSubscription } from '../../billing/hooks/useBilling'
import { getStoryDetail, getStoryFullBreakdown } from '../api'

// Public response is always the free-tier-capped view (shared cache, ARCHITECTURE §10 —
// see api.ts/service.ts for why). Only fetch the entitled-only full breakdown when the base
// response actually reports something hidden and the signed-in reader is entitled.
export function useStoryDetail(id: string) {
  const { data: subscription } = useSubscription()
  const baseQuery = useQuery({ queryKey: ['story', id], queryFn: () => getStoryDetail(id) })
  const shouldFetchFull = (subscription?.entitled ?? false) && baseQuery.data?.premiumBreakdown.locked === true
  const fullQuery = useQuery({
    queryKey: ['story-full', id],
    queryFn: () => getStoryFullBreakdown(id),
    enabled: shouldFetchFull,
  })
  return {
    data: fullQuery.data ?? baseQuery.data,
    error: baseQuery.error,
    isLoading: baseQuery.isLoading,
  }
}
