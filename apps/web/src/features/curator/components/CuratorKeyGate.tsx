import { useState, type FormEvent, type ReactNode } from 'react'

import { getBlindspotFeed } from '../api'
import { CuratorApiError } from '../lib/curatorFetch'
import { useCuratorStore } from '../store'

export function CuratorKeyGate({ children }: { children: ReactNode }) {
  const { apiKey, clearApiKey } = useCuratorStore()
  const [input, setInput] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (apiKey !== null) return children

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setChecking(true)
    setError(null)
    useCuratorStore.getState().setApiKey(input)
    try {
      await getBlindspotFeed() // cheap, already-registered route — validates the key for real
    } catch (err) {
      clearApiKey()
      setError(err instanceof CuratorApiError && err.status === 401 ? 'Invalid curator key.' : 'Could not reach the API.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-3">
      <h1 className="text-xl font-semibold">Curator access</h1>
      <input
        type="password"
        required
        placeholder="Curator key"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
      />
      {error !== null && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={checking}
        className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {checking ? 'Checking…' : 'Continue'}
      </button>
    </form>
  )
}
