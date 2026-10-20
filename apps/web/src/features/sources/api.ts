import { apiFetch } from '../../lib/apiClient'
import type { Ownership, Source, SourceGeoRatings, SourceListFilters, SourceListResponse, SourceRatings, SourceSensationalism } from './types'

export function getSource(id: string): Promise<Source> {
  return apiFetch<Source>(`/api/public/sources/${id}`)
}

export function listSources(filters: SourceListFilters): Promise<SourceListResponse> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  const query = params.toString()
  return apiFetch<SourceListResponse>(`/api/public/sources${query === '' ? '' : `?${query}`}`)
}

export function getSourceRatings(id: string): Promise<SourceRatings> {
  return apiFetch<SourceRatings>(`/api/public/sources/${id}/ratings`)
}

export function getSourceGeoRatings(id: string): Promise<SourceGeoRatings> {
  return apiFetch<SourceGeoRatings>(`/api/public/sources/${id}/geo`)
}

export function getSourceSensationalism(id: string): Promise<SourceSensationalism> {
  return apiFetch<SourceSensationalism>(`/api/public/sources/${id}/sensationalism`)
}

export function getSourceOwnership(id: string): Promise<Ownership | null> {
  return apiFetch<Ownership | null>(`/api/public/sources/${id}/ownership`)
}
