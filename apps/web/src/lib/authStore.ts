import { create } from 'zustand'

// Access token lives in memory only (ARCHITECTURE §9: "no long-lived tokens in
// JS-readable storage") — never persisted to localStorage/sessionStorage. Lost on
// reload; apiClient's boot-time silent refresh (lib/apiClient.ts) restores it from
// the httpOnly refresh cookie.
export interface AuthUser {
  id: string
}

interface AuthState {
  accessToken: string | null
  user: AuthUser | null
  // False until the app's one boot-time silent refresh (lib/apiClient.ts silentLogin)
  // has settled, either way — route guards wait on this instead of treating a still-
  // loading session as "logged out".
  authReady: boolean
  setSession: (accessToken: string, user: AuthUser) => void
  clearSession: () => void
  markAuthReady: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  authReady: false,
  setSession: (accessToken, user) => set({ accessToken, user, authReady: true }),
  clearSession: () => set({ accessToken: null, user: null, authReady: true }),
  markAuthReady: () => set({ authReady: true }),
}))
