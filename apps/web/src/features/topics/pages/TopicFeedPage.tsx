import { useParams } from 'react-router-dom'

import { FeedItemCard } from '../../feed'
import { EmptyState, ErrorState, LoadingState, LoadMoreButton } from '../../../components/QueryStates'
import { SaveToggleButton } from '../../saved'
import { useTopicFeed, useTopics } from '../hooks/useTopics'

export function TopicFeedPage() {
  const { id } = useParams<{ id: string }>()
  const topicId = id ?? ''
  const { data: topics } = useTopics()
  const topic = topics?.find((t) => t.id === topicId)
  const { data, error, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage } = useTopicFeed(topicId)

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState message="Couldn't load this topic's feed." />

  const items = data?.pages.flatMap((p) => p.items) ?? []

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1>{topic?.name ?? 'Topic'}</h1>
        {topicId !== '' && <SaveToggleButton kind="topics" id={topicId} />}
      </div>
      {items.length === 0 ? (
        <EmptyState message="No stories matching this topic in the last 14 days." />
      ) : (
        <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2 lg:grid-cols-3" style={{ background: 'var(--color-divider)', border: '2px solid var(--color-divider)' }}>
          {items.map((item) => (
            <FeedItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
      {hasNextPage && <LoadMoreButton onClick={() => fetchNextPage()} loading={isFetchingNextPage} />}
    </div>
  )
}
