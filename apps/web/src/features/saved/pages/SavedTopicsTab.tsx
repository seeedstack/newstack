import { Link } from 'react-router-dom'

import { Button } from '../../../components/ui/Button'
import { ErrorState, LoadingState } from '../../../components/QueryStates'
import { useSavedTopics, useSavedToggle } from '../hooks/useSaved'

export function SavedTopicsTab() {
  const { items, isLoading, error } = useSavedTopics()
  const { unsave } = useSavedToggle('topics')

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState message="Couldn't load followed topics." />
  if (items.length === 0) return <p className="text-muted text-sm">You're not following any topics yet.</p>

  return (
    <ul className="flex flex-col" style={{ borderTop: '2px solid var(--color-divider)' }}>
      {items.map((topic) => (
        <li key={topic.id} className="flex items-center justify-between gap-4 py-3" style={{ borderBottom: '1px solid var(--color-divider)' }}>
          <Link to={`/topics/${topic.id}`} className="hover:underline">
            {topic.name}
          </Link>
          <Button variant="ghost" onClick={() => unsave.mutate(topic.id)}>Unfollow</Button>
        </li>
      ))}
    </ul>
  )
}
