import { decodeAccessTokenSubject } from './jwt'
import { useAuthStore } from './authStore'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string) {
    super(code)
    this.status = status
    this.code = code
  }
}

// ARCHITECTURE §9 CSRF defense-in-depth requires Content-Type: application/json on every
// state-changing request, even one with no body (a bare HTML form can't forge that content
// type) — every mutating call below sends it unconditionally, not just when `body` is set.
// Fastify's JSON parser then rejects that content-type paired with a truly empty body
// (FST_ERR_CTP_EMPTY_JSON_BODY), so a bodyless mutation sends the minimal valid JSON `{}`.
async function doRefresh(): Promise<string | null> {
  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!res.ok) {
    useAuthStore.getState().clearSession()
    return null
  }
  const body = (await res.json()) as { accessToken: string }
  const sub = decodeAccessTokenSubject(body.accessToken)
  useAuthStore.getState().setSession(body.accessToken, { id: sub ?? '' })
  return body.accessToken
}

let refreshPromise: Promise<string | null> | null = null

// Single-flight across concurrent callers and parallel tabs (ARCHITECTURE §9's
// `navigator.locks.request('auth-refresh', …)` pattern; falls back to an in-module
// promise where the Web Locks API isn't available, e.g. the test environment).
function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise !== null) return refreshPromise

  const run = (): Promise<string | null> =>
    doRefresh().finally(() => {
      refreshPromise = null
    })

  refreshPromise =
    typeof navigator !== 'undefined' && navigator.locks
      ? navigator.locks.request('auth-refresh', run)
      : run()
  return refreshPromise
}

// Call once at app boot to recover a session from the httpOnly refresh cookie, if any.
export function silentLogin(): Promise<string | null> {
  return refreshAccessToken()
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  body?: unknown
}

const API_PREFIX = '/api/'
const PUBLIC_PREFIX = '/api/public/'

// /api/* needs the access token; /api/public/* and /auth/* never do (ARCHITECTURE §10
// cache-isolation scopes — a public handler can't read identity even if a token is sent).
function needsAuthHeader(path: string): boolean {
  return path.startsWith(API_PREFIX) && !path.startsWith(PUBLIC_PREFIX)
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const authRequired = needsAuthHeader(path)

  const method = options.method ?? 'GET'
  const send = (): Promise<Response> => {
    const headers: Record<string, string> = {}
    if (method !== 'GET') headers['Content-Type'] = 'application/json'
    if (authRequired) {
      const token = useAuthStore.getState().accessToken
      if (token !== null) headers.Authorization = `Bearer ${token}`
    }
    return fetch(`${BASE_URL}${path}`, {
      method,
      credentials: 'include',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : method === 'GET' ? undefined : '{}',
    })
  }

  let res = await send()
  if (res.status === 401 && authRequired) {
    const token = await refreshAccessToken()
    if (token !== null) res = await send()
  }

  if (res.status === 204) return undefined as T
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'unknown_error' }))
    throw new ApiError(res.status, typeof body.error === 'string' ? body.error : 'unknown_error')
  }
  return (await res.json()) as T
}
