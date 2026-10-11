import { Link } from 'react-router-dom'

import { ErrorState, LoadingState } from '../../../components/QueryStates'
import { useSavedTopics, useSavedToggle } from '../hooks/useSaved'

export function SavedTopicsTab() {
  const { items, isLoading, error } = useSavedTopics()
  const { unsave } = useSavedToggle('topics')

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState message="Couldn't load followed topics." />
  if (items.length === 0) return <p className="text-sm text-neutral-500">You're not following any topics yet.</p>

  return (
    <ul className="flex flex-col gap-2">
      {items.map((topic) => (
        <li key={topic.id} className="flex items-center justify-between gap-4 rounded border border-neutral-200 p-3 dark:border-neutral-800">
          <Link to={`/topics/${topic.id}`} className="hover:underline">
            {topic.name}
          </Link>
          <button type="button" onClick={() => unsave.mutate(topic.id)} className="text-sm underline">
            Unfollow
          </button>
        </li>
      ))}
    </ul>
  )
}
