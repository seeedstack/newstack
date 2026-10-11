import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useCuratorStore } from '../store'
import { CuratorApiError, curatorFetch } from './curatorFetch'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

beforeEach(() => {
  useCuratorStore.setState({ apiKey: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('curatorFetch', () => {
  it('attaches the X-Curator-Key header when a key is set', async () => {
    useCuratorStore.setState({ apiKey: 'secret' })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, { items: [] }))
    await curatorFetch('/api/curator/blindspot-feed')
    const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers['X-Curator-Key']).toBe('secret')
  })

  it('throws a CuratorApiError on a non-2xx response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(401, { error: 'missing_curator_key' }))
    await expect(curatorFetch('/api/curator/sources', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 401,
      code: 'missing_curator_key',
    })
  })

  it('treats 204 as no body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
    expect(await curatorFetch('/api/curator/stories/x/hide', { method: 'POST' })).toBeUndefined()
  })
})

describe('CuratorApiError', () => {
  it('carries status and code', () => {
    const err = new CuratorApiError(400, 'validation_error')
    expect(err.status).toBe(400)
    expect(err.code).toBe('validation_error')
  })
})
