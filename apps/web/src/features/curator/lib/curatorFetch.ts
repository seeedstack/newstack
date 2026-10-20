import { useCuratorStore } from '../store'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export class CuratorApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string) {
    super(code)
    this.status = status
    this.code = code
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT'
  body?: unknown
}

export async function curatorFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const apiKey = useCuratorStore.getState().apiKey
  const method = options.method ?? 'GET'
  const headers: Record<string, string> = {}
  // Curator routes are CSRF-exempt server-side (app.ts), but every other mutating call in
  // this app sends Content-Type unconditionally (see apiClient.ts) — matching that here
  // keeps the two clients consistent rather than relying on the exemption staying in place.
  if (method !== 'GET') headers['Content-Type'] = 'application/json'
  if (apiKey !== null) headers['X-Curator-Key'] = apiKey

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    // Fastify rejects Content-Type: application/json paired with a truly empty body
    // (FST_ERR_CTP_EMPTY_JSON_BODY) — a bodyless mutation sends the minimal valid JSON `{}`.
    body: options.body !== undefined ? JSON.stringify(options.body) : method === 'GET' ? undefined : '{}',
  })

  if (res.status === 204) return undefined as T
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'unknown_error' }))
    throw new CuratorApiError(res.status, typeof body.error === 'string' ? body.error : 'unknown_error')
  }
  return (await res.json()) as T
}
