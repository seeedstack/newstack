import { Link } from 'react-router-dom'

import { ErrorState, LoadingState } from '../../../components/QueryStates'
import { useSavedStories, useSavedToggle } from '../hooks/useSaved'

export function SavedStoriesTab() {
  const { items, isLoading, error } = useSavedStories()
  const { unsave } = useSavedToggle('stories')

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState message="Couldn't load saved stories." />
  if (items.length === 0) return <p className="text-sm text-neutral-500">You haven't saved any stories yet.</p>

  return (
    <ul className="flex flex-col gap-2">
      {items.map((story) => {
        // PRODUCT §7.2: a tombstoned saved story shows its successor.
        const target = story.status === 'tombstoned' && story.redirectTo !== null ? story.redirectTo : story
        const unavailable = story.status === 'tombstoned' && story.redirectTo === null

        return (
          <li key={story.id} className="flex items-center justify-between gap-4 rounded border border-neutral-200 p-3 dark:border-neutral-800">
            {unavailable ? (
              <p className="text-neutral-500">{story.title} (unavailable)</p>
            ) : (
              <Link to={`/stories/${target.id}`} className="hover:underline">
                {target.title}
              </Link>
            )}
            <button type="button" onClick={() => unsave.mutate(story.id)} className="text-sm underline">
              Remove
            </button>
          </li>
        )
      })}
    </ul>
  )
}
