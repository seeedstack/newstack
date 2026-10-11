import { ErrorState, LoadingState } from '../../../components/QueryStates'
import { useSavedSources, useSavedToggle } from '../hooks/useSaved'

export function SavedSourcesTab() {
  const { items, isLoading, error } = useSavedSources()
  const { unsave } = useSavedToggle('sources')

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState message="Couldn't load followed sources." />
  if (items.length === 0) return <p className="text-sm text-neutral-500">You're not following any sources yet.</p>

  return (
    <ul className="flex flex-col gap-2">
      {items.map((source) => (
        <li key={source.id} className="flex items-center justify-between gap-4 rounded border border-neutral-200 p-3 dark:border-neutral-800">
          <div>
            <p className="font-medium">{source.name}</p>
            <p className="text-xs text-neutral-500">
              {source.domain}
              {source.status === 'deprecated' && ' · no longer updated'}
            </p>
          </div>
          <button type="button" onClick={() => unsave.mutate(source.id)} className="text-sm underline">
            Unfollow
          </button>
        </li>
      ))}
    </ul>
  )
}
