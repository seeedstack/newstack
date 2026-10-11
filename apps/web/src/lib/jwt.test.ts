import { describe, expect, it } from 'vitest'

import { decodeAccessTokenSubject } from './jwt'

describe('decodeAccessTokenSubject', () => {
  it('reads the sub claim from a well-formed token', () => {
    const payload = btoa(JSON.stringify({ sub: 'user-123', av: 1 }))
    expect(decodeAccessTokenSubject(`header.${payload}.sig`)).toBe('user-123')
  })

  it('handles base64url padding/characters', () => {
    const payload = btoa(JSON.stringify({ sub: 'u2' })).replace(/\+/g, '-').replace(/\//g, '_')
    expect(decodeAccessTokenSubject(`h.${payload}.s`)).toBe('u2')
  })

  it('returns null for a malformed token', () => {
    expect(decodeAccessTokenSubject('not-a-jwt')).toBeNull()
    expect(decodeAccessTokenSubject('h.not-base64!!!.s')).toBeNull()
  })
})
