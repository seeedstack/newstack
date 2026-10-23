import { Link } from 'react-router-dom'

import { Button } from '../../../components/ui/Button'
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
      <Link to="/login" className="text-sm" style={{ color: 'var(--color-accent)' }}>
        Sign in to {idleLabel.toLowerCase()}
      </Link>
    )
  }

  return (
    <Button
      variant={isSaved ? 'secondary' : 'primary'}
      disabled={pending}
      onClick={() => (isSaved ? unsave.mutate(id) : save.mutate(id))}
      style={{ fontSize: '13px' }}
    >
      {isSaved ? `${activeLabel} ✓` : idleLabel}
    </Button>
  )
}
