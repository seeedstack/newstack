import { useHomeFeed } from '../hooks/useHomeFeed'
import { FeedItemCard } from '../components/FeedItemCard'
import { BiasBarLegend } from '../components/BiasBarLegend'
import { EmptyState, ErrorState, LoadingState, LoadMoreButton } from '../../../components/QueryStates'

export function HomeFeedPage() {
  const { data, error, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, refetch } = useHomeFeed()

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState message="Couldn't load the feed. Try again." />

  const items = data?.pages.flatMap((p) => p.items) ?? []
  const updatedCount = data?.pages[0]?.updatedCount ?? 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Latest</h1>
        <BiasBarLegend />
      </div>

      {updatedCount > 0 && (
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded bg-blue-50 px-3 py-2 text-left text-sm text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300"
        >
          {updatedCount} {updatedCount === 1 ? 'story' : 'stories'} updated — refresh
        </button>
      )}

      {items.length === 0 ? (
        <EmptyState message="No stories yet." />
      ) : (
        items.map((item) => <FeedItemCard key={item.id} item={item} />)
      )}

      {hasNextPage && <LoadMoreButton onClick={() => fetchNextPage()} loading={isFetchingNextPage} />}
    </div>
  )
}
