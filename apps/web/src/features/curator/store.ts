import { create } from 'zustand'

// Curator auth is a shared-secret header, not a session (ARCHITECTURE §10 curator auth
// decision) — kept in memory only, same "never persist a credential" rule as the user's
// access token.
interface CuratorState {
  apiKey: string | null
  setApiKey: (key: string) => void
  clearApiKey: () => void
}

export const useCuratorStore = create<CuratorState>((set) => ({
  apiKey: null,
  setApiKey: (key) => set({ apiKey: key }),
  clearApiKey: () => set({ apiKey: null }),
}))
