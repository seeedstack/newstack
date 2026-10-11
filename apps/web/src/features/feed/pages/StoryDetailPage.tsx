import { Link, useParams } from 'react-router-dom'

import { EmptyState, ErrorState, LoadingState } from '../../../components/QueryStates'
import { SaveToggleButton } from '../../saved'
import { BiasColumn } from '../components/BiasColumn'
import { useStoryDetail } from '../hooks/useStoryDetail'

const COLUMNS: { key: 'left' | 'centerLeft' | 'center' | 'centerRight' | 'right' | 'notRated'; label: string; colorClass: string }[] = [
  { key: 'left', label: 'Left', colorClass: 'bg-bias-left' },
  { key: 'centerLeft', label: 'Center-left', colorClass: 'bg-bias-centerleft' },
  { key: 'center', label: 'Center', colorClass: 'bg-bias-center' },
  { key: 'centerRight', label: 'Center-right', colorClass: 'bg-bias-centerright' },
  { key: 'right', label: 'Right', colorClass: 'bg-bias-right' },
  { key: 'notRated', label: 'Not rated', colorClass: 'bg-bias-unrated' },
]

export function StoryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: story, error, isLoading } = useStoryDetail(id ?? '')

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState message="Couldn't load this story." />
  if (story === undefined) return <EmptyState message="Story not found." />

  if (story.status === 'tombstoned') {
    return (
      <div>
        <h1 className="text-xl font-semibold">{story.title}</h1>
        {story.redirectTo !== null ? (
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            This story moved to{' '}
            <Link to={`/stories/${story.redirectTo.id}`} className="underline">
              {story.redirectTo.title}
            </Link>
            .
          </p>
        ) : (
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">This story is no longer available.</p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold">{story.title}</h1>
        <SaveToggleButton kind="stories" id={story.id} />
      </div>
      {story.summary !== null && <p className="text-sm text-neutral-600 dark:text-neutral-400">{story.summary}</p>}

      {story.splitNotices.length > 0 && (
        <div className="rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800">
          Also continued in:{' '}
          {story.splitNotices.map((notice, i) => (
            <span key={notice.storyId}>
              {i > 0 && ', '}
              <Link to={`/stories/${notice.storyId}`} className="underline">
                {notice.title}
              </Link>{' '}
              ({notice.articleCount} articles)
            </span>
          ))}
        </div>
      )}

      <p className="text-xs text-neutral-500">
        {story.ratedSourceCount} rated sources
        {story.unratedSourceCount > 0 ? `, ${story.unratedSourceCount} unrated` : ''} · Based on current source
        ratings
      </p>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {COLUMNS.map((col) => (
          <BiasColumn key={col.key} label={col.label} colorClass={col.colorClass} cards={story.biasColumns[col.key]} />
        ))}
      </div>
    </div>
  )
}
