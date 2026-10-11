import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, apiFetch, silentLogin } from './apiClient'
import { useAuthStore } from './authStore'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

beforeEach(() => {
  useAuthStore.setState({ accessToken: null, user: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('apiFetch', () => {
  it('does not attach an Authorization header on /api/public/* routes', async () => {
    useAuthStore.setState({ accessToken: 'secret-token', user: { id: 'u1' } })
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(200, { items: [] }))

    await apiFetch('/api/public/feed')

    const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })

  it('attaches the Authorization header on authenticated /api/* routes', async () => {
    useAuthStore.setState({ accessToken: 'secret-token', user: { id: 'u1' } })
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(200, { userId: 'u1' }))

    await apiFetch('/api/whoami')

    const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer secret-token')
  })

  it('on a 401 from an authenticated route, refreshes once and retries the original request', async () => {
    useAuthStore.setState({ accessToken: 'stale-token', user: { id: 'u1' } })
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(401, { error: 'access_version_mismatch' })) // original call
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'new-token' })) // /auth/refresh
      .mockResolvedValueOnce(jsonResponse(200, { userId: 'u1' })) // retried call

    const result = await apiFetch<{ userId: string }>('/api/whoami')

    expect(result).toEqual({ userId: 'u1' })
    expect(fetchSpy).toHaveBeenCalledTimes(3)
    expect(fetchSpy.mock.calls[1][0]).toContain('/auth/refresh')
    const retryHeaders = fetchSpy.mock.calls[2][1]?.headers as Record<string, string>
    expect(retryHeaders.Authorization).toBe('Bearer new-token')
    expect(useAuthStore.getState().accessToken).toBe('new-token')
  })

  it('surfaces the original 401 when refresh itself fails, and clears the session', async () => {
    useAuthStore.setState({ accessToken: 'stale-token', user: { id: 'u1' } })
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(401, { error: 'access_version_mismatch' }))
      .mockResolvedValueOnce(jsonResponse(401, { error: 'refresh_rejected' }))

    await expect(apiFetch('/api/whoami')).rejects.toThrow(ApiError)
    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('treats 204 as no body', async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }))
    const result = await apiFetch('/api/me/saved-stories/x')
    expect(result).toBeUndefined()
  })

  it('throws an ApiError carrying the server error code on a non-2xx response', async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(400, { error: 'invalid_cursor' }))
    await expect(apiFetch('/api/public/feed')).rejects.toMatchObject({ status: 400, code: 'invalid_cursor' })
  })

  it('concurrent 401s share a single refresh call (single-flight)', async () => {
    useAuthStore.setState({ accessToken: 'stale-token', user: { id: 'u1' } })
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(401, { error: 'x' }))
      .mockResolvedValueOnce(jsonResponse(401, { error: 'x' }))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'new-token' }))
      .mockResolvedValueOnce(jsonResponse(200, { userId: 'u1' }))
      .mockResolvedValueOnce(jsonResponse(200, { userId: 'u1' }))

    const [a, b] = await Promise.all([apiFetch('/api/whoami'), apiFetch('/api/whoami')])

    expect(a).toEqual({ userId: 'u1' })
    expect(b).toEqual({ userId: 'u1' })
    const refreshCalls = fetchSpy.mock.calls.filter((c: Parameters<typeof fetch>) => String(c[0]).includes('/auth/refresh'))
    expect(refreshCalls).toHaveLength(1)
  })
})

describe('silentLogin', () => {
  it('populates the auth store from a valid refresh cookie', async () => {
    const token = `h.${btoa(JSON.stringify({ sub: 'u1' }))}.s`
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(200, { accessToken: token }))

    await silentLogin()

    expect(useAuthStore.getState().accessToken).toBe(token)
    expect(useAuthStore.getState().user).toEqual({ id: 'u1' })
  })

  it('leaves the store empty when there is no valid refresh cookie', async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(401, { error: 'refresh_rejected' }))
    await silentLogin()
    expect(useAuthStore.getState().accessToken).toBeNull()
  })
})
