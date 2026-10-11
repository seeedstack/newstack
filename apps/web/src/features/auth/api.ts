import { apiFetch } from '../../lib/apiClient'
import { decodeAccessTokenSubject } from '../../lib/jwt'
import { useAuthStore } from '../../lib/authStore'
import type { LoginResponse } from './types'

export function signup(email: string, password: string): Promise<void> {
  return apiFetch('/auth/signup', { method: 'POST', body: { email, password } })
}

export function verifyEmail(token: string): Promise<void> {
  return apiFetch('/auth/verify', { method: 'POST', body: { token } })
}

export async function login(email: string, password: string): Promise<void> {
  const { accessToken } = await apiFetch<LoginResponse>('/auth/login', { method: 'POST', body: { email, password } })
  const sub = decodeAccessTokenSubject(accessToken)
  useAuthStore.getState().setSession(accessToken, { id: sub ?? '' })
}

// Revokes the server-side session (not just the local token) now that POST /auth/logout
// exists — clears the local session regardless of whether the network call succeeds, since
// the user's intent ("log out") is satisfied locally either way.
export async function logout(): Promise<void> {
  try {
    await apiFetch('/auth/logout', { method: 'POST' })
  } catch {
    // Ignored — the local session is cleared below regardless.
  }
  useAuthStore.getState().clearSession()
}

export function requestPasswordReset(email: string): Promise<void> {
  return apiFetch('/auth/reset/request', { method: 'POST', body: { email } })
}

export function confirmPasswordReset(token: string, newPassword: string): Promise<void> {
  return apiFetch('/auth/reset/confirm', { method: 'POST', body: { token, newPassword } })
}
