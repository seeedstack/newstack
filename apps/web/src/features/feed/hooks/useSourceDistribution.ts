import { useQuery } from '@tanstack/react-query'

import { getSourceDistribution } from '../api'

// Ratings change rarely (manual curation) and the endpoint is itself cached 1h server-side,
// so there's no value in refetching this on every mount.
export function useSourceDistribution() {
  return useQuery({
    queryKey: ['sources', 'distribution'],
    queryFn: getSourceDistribution,
    staleTime: 60 * 60 * 1000,
  })
}
