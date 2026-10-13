import type { components } from '../../../../../packages/shared-types/src/openapi'

export type Source = components['schemas']['Source']
export type Rating = components['schemas']['Rating']
export interface SourceRatings {
  current: Rating | null
  history: Rating[]
}
