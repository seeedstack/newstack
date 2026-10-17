import { Link, useNavigate, useParams } from 'react-router-dom'

import { Button } from '../../../components/ui/Button'
import { IconArrowLeft } from '../../../components/ui/icons'
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
  const navigate = useNavigate()

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState message="Couldn't load this story." />
  if (story === undefined) return <EmptyState message="Story not found." />

  if (story.status === 'tombstoned') {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="article-headline">{story.title}</h1>
        {story.redirectTo !== null ? (
          <p className="text-sm opacity-80">
            This story moved to{' '}
            <Link to={`/stories/${story.redirectTo.id}`} className="underline" style={{ color: 'var(--color-accent)' }}>
              {story.redirectTo.title}
            </Link>
            .
          </p>
        ) : (
          <p className="text-sm opacity-80">This story is no longer available.</p>
        )}
      </div>
    )
  }

  const total = Object.values(story.biasColumns).reduce((sum, cards) => sum + cards.length, 0)

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" onClick={() => navigate(-1)} className="self-start">
        <IconArrowLeft size={16} />
        Back
      </Button>

      <div className="flex items-start justify-between gap-4">
        <h1 className="article-headline" style={{ textWrap: 'pretty' }}>{story.title}</h1>
        <SaveToggleButton kind="stories" id={story.id} />
      </div>
      {story.summary !== null && <p className="max-w-[62ch] text-base">{story.summary}</p>}

      {story.splitNotices.length > 0 && (
        <div className="p-3 text-sm" style={{ border: '2px solid var(--color-divider)' }}>
          Also continued in:{' '}
          {story.splitNotices.map((notice, i) => (
            <span key={notice.storyId}>
              {i > 0 && ', '}
              <Link to={`/stories/${notice.storyId}`} className="underline" style={{ color: 'var(--color-accent)' }}>
                {notice.title}
              </Link>{' '}
              ({notice.articleCount} articles)
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 p-4" style={{ border: '2px solid var(--color-divider)' }}>
        <h6 className="m-0">Coverage spread</h6>
        {total === 0 ? (
          <p className="text-muted text-sm">No sources yet.</p>
        ) : (
          <div className="flex h-3 w-full gap-0.5">
            {COLUMNS.map((col) => {
              const count = story.biasColumns[col.key].length
              if (count === 0) return null
              return <div key={col.key} className={col.colorClass} style={{ width: `${(count / total) * 100}%` }} title={`${col.label}: ${count}`} />
            })}
          </div>
        )}
        <p className="text-muted text-xs">
          {story.ratedSourceCount} rated sources{story.unratedSourceCount > 0 ? ` · ${story.unratedSourceCount} unrated` : ''}
        </p>
      </div>

      <div style={{ borderTop: '2px solid var(--color-divider)', paddingTop: 'var(--space-4)' }}>
        <h2>How it's being told</h2>
        <p className="text-muted mt-1">The same event, as headlined by each outlet.</p>
      </div>

      <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2 lg:grid-cols-3" style={{ background: 'var(--color-divider)', border: '2px solid var(--color-divider)' }}>
        {COLUMNS.map((col) => (
          <BiasColumn key={col.key} label={col.label} colorClass={col.colorClass} cards={story.biasColumns[col.key]} />
        ))}
      </div>
    </div>
  )
}
