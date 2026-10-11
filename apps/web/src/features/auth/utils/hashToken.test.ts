import { describe, expect, it } from 'vitest'

import { readTokenFromHash } from './hashToken'

describe('readTokenFromHash', () => {
  it('reads the t param from a fragment', () => {
    expect(readTokenFromHash('#t=abc123')).toBe('abc123')
  })

  it('returns null when there is no t param', () => {
    expect(readTokenFromHash('')).toBeNull()
    expect(readTokenFromHash('#other=1')).toBeNull()
  })
})
