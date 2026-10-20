import type { components } from '../../../../../packages/shared-types/src/openapi'

export type Source = components['schemas']['Source']
export type Rating = components['schemas']['Rating']
export interface SourceRatings {
  current: Rating | null
  history: Rating[]
}

export type GeoRating = components['schemas']['GeoRating']
export type GeoTopicCode = GeoRating['topicCode']
export type SourceGeoRatings = Record<GeoTopicCode, { current: GeoRating | null; history: GeoRating[] }>

export type SensationalismRating = components['schemas']['SensationalismRating']
export interface SourceSensationalism {
  current: SensationalismRating | null
  history: SensationalismRating[]
}

export type Ownership = components['schemas']['Ownership']

export type SourceListItem = components['schemas']['SourceListItem']
export type SourceCategory = SourceListItem['categories'][number]
export type SourceListResponse = components['schemas']['SourceListResponse']

export interface SourceListFilters {
  category?: SourceCategory
  country?: string
  language?: string
  q?: string
  limit?: number
  offset?: number
}
