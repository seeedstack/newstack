import { Link } from 'react-router-dom'

import { useAuthStore } from '../../../lib/authStore'
import { useSavedIds, useSavedToggle } from '../hooks/useSaved'

type Kind = 'sources' | 'stories' | 'topics'

const LABELS: Record<Kind, [string, string]> = {
  sources: ['Follow', 'Following'],
  topics: ['Follow', 'Following'],
  stories: ['Save', 'Saved'],
}

export function SaveToggleButton({ kind, id }: { kind: Kind; id: string }) {
  const isSignedIn = useAuthStore((s) => s.accessToken !== null)
  const { data: savedIds } = useSavedIds(kind)
  const { save, unsave } = useSavedToggle(kind)
  const isSaved = savedIds?.includes(id) ?? false
  const [idleLabel, activeLabel] = LABELS[kind]
  const pending = save.isPending || unsave.isPending

  if (!isSignedIn) {
    return (
      <Link to="/login" className="text-sm underline">
        Sign in to {idleLabel.toLowerCase()}
      </Link>
    )
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => (isSaved ? unsave.mutate(id) : save.mutate(id))}
      className={`rounded border px-3 py-1 text-sm disabled:opacity-50 ${
        isSaved
          ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
          : 'border-neutral-300 dark:border-neutral-700'
      }`}
    >
      {isSaved ? activeLabel : idleLabel}
    </button>
  )
}
