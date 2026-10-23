import { Link } from 'react-router-dom'

import { Button } from '../../../components/ui/Button'
import { ErrorState, LoadingState } from '../../../components/QueryStates'
import { useSavedStories, useSavedToggle } from '../hooks/useSaved'

export function SavedStoriesTab() {
  const { items, isLoading, error } = useSavedStories()
  const { unsave } = useSavedToggle('stories')

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState message="Couldn't load saved stories." />
  if (items.length === 0) return <p className="text-muted text-sm">You haven't saved any stories yet.</p>

  return (
    <ul className="flex flex-col" style={{ borderTop: '2px solid var(--color-divider)' }}>
      {items.map((story) => {
        // PRODUCT §7.2: a tombstoned saved story shows its successor.
        const target = story.status === 'tombstoned' && story.redirectTo !== null ? story.redirectTo : story
        const unavailable = story.status === 'tombstoned' && story.redirectTo === null

        return (
          <li key={story.id} className="flex items-center justify-between gap-4 py-3" style={{ borderBottom: '1px solid var(--color-divider)' }}>
            {unavailable ? (
              <p className="text-muted">{story.title} (unavailable)</p>
            ) : (
              <Link to={`/stories/${target.id}`} className="hover:underline">
                {target.title}
              </Link>
            )}
            <Button variant="ghost" onClick={() => unsave.mutate(story.id)}>Remove</Button>
          </li>
        )
      })}
    </ul>
  )
}
