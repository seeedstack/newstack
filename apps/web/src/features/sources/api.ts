import { apiFetch } from '../../lib/apiClient'
import type { Source, SourceRatings } from './types'

export function getSource(id: string): Promise<Source> {
  return apiFetch<Source>(`/api/public/sources/${id}`)
}

export function getSourceRatings(id: string): Promise<SourceRatings> {
  return apiFetch<SourceRatings>(`/api/public/sources/${id}/ratings`)
}
