import { Link } from 'react-router-dom'

import { Button } from '../../../components/ui/Button'
import { ErrorState, LoadingState } from '../../../components/QueryStates'
import { useSavedSources, useSavedToggle } from '../hooks/useSaved'

export function SavedSourcesTab() {
  const { items, isLoading, error } = useSavedSources()
  const { unsave } = useSavedToggle('sources')

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState message="Couldn't load followed sources." />
  if (items.length === 0) return <p className="text-muted text-sm">You're not following any sources yet.</p>

  return (
    <ul className="flex flex-col" style={{ borderTop: '2px solid var(--color-divider)' }}>
      {items.map((source) => (
        <li key={source.id} className="flex items-center justify-between gap-4 py-3" style={{ borderBottom: '1px solid var(--color-divider)' }}>
          <Link to={`/sources/${source.id}`} className="hover:underline">
            <p className="font-medium">{source.name}</p>
            <p className="text-muted text-xs">
              {source.domain}
              {source.status === 'deprecated' && ' · no longer updated'}
            </p>
          </Link>
          <Button variant="ghost" onClick={() => unsave.mutate(source.id)}>Unfollow</Button>
        </li>
      ))}
    </ul>
  )
}
