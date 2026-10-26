import { useQuery } from '@tanstack/react-query'

import { getSource, getSourceGeoRatings, getSourceOwnership, getSourceRatings, getSourceSensationalism, listSources } from '../api'
import type { SourceListFilters } from '../types'

export function useSource(id: string) {
  return useQuery({ queryKey: ['source', id], queryFn: () => getSource(id), enabled: id !== '' })
}

export function useSourceList(filters: SourceListFilters) {
  return useQuery({ queryKey: ['sources', 'list', filters], queryFn: () => listSources(filters) })
}

export function useSourceRatings(id: string) {
  return useQuery({ queryKey: ['source', id, 'ratings'], queryFn: () => getSourceRatings(id), enabled: id !== '' })
}

export function useSourceGeoRatings(id: string) {
  return useQuery({ queryKey: ['source', id, 'geo'], queryFn: () => getSourceGeoRatings(id), enabled: id !== '' })
}

export function useSourceSensationalism(id: string) {
  return useQuery({
    queryKey: ['source', id, 'sensationalism'],
    queryFn: () => getSourceSensationalism(id),
    enabled: id !== '',
  })
}

export function useSourceOwnership(id: string) {
  return useQuery({ queryKey: ['source', id, 'ownership'], queryFn: () => getSourceOwnership(id), enabled: id !== '' })
}
