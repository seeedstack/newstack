import { useHomeFeed } from '../hooks/useHomeFeed'
import { FeedItemCard } from '../components/FeedItemCard'
import { BiasBarLegend } from '../components/BiasBarLegend'
import { EmptyState, ErrorState, LoadingState, LoadMoreButton } from '../../../components/QueryStates'
import { SectionEyebrow } from '../../../components/ui/SectionEyebrow'

export function HomeFeedPage() {
  const { data, error, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, refetch } = useHomeFeed()

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState message="Couldn't load the feed. Try again." />

  const items = data?.pages.flatMap((p) => p.items) ?? []
  const updatedCount = data?.pages[0]?.updatedCount ?? 0

  return (
    <div className="flex flex-col gap-6">
      <SectionEyebrow>Latest</SectionEyebrow>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="article-headline">Latest</h1>
        <BiasBarLegend />
      </div>

      {updatedCount > 0 && (
        <button
          type="button"
          onClick={() => refetch()}
          className="p-3 text-left text-sm"
          style={{ background: 'var(--color-accent-100)', color: 'var(--color-accent-800)' }}
        >
          {updatedCount} {updatedCount === 1 ? 'story' : 'stories'} updated — refresh
        </button>
      )}

      {items.length === 0 ? (
        <EmptyState message="No stories yet." />
      ) : (
        <div className="feed-grid">
          {items.map((item) => (
            <FeedItemCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {hasNextPage && <LoadMoreButton onClick={() => fetchNextPage()} loading={isFetchingNextPage} />}
    </div>
  )
}
