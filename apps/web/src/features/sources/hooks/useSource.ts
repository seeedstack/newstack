import { useQuery } from '@tanstack/react-query'

import { getSource, getSourceRatings } from '../api'

export function useSource(id: string) {
  return useQuery({ queryKey: ['source', id], queryFn: () => getSource(id), enabled: id !== '' })
}

export function useSourceRatings(id: string) {
  return useQuery({ queryKey: ['source', id, 'ratings'], queryFn: () => getSourceRatings(id), enabled: id !== '' })
}
