import { useHomeFeed } from '../hooks/useHomeFeed'
import { FeedItemCard } from '../components/FeedItemCard'
import { LeadStoryCard } from '../components/LeadStoryCard'
import { BiasBarLegend } from '../components/BiasBarLegend'
import { EmptyState, ErrorState, LoadingState, LoadMoreButton } from '../../../components/QueryStates'
import { SectionEyebrow } from '../../../components/ui/SectionEyebrow'

export function HomeFeedPage() {
  const { data, error, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, refetch } = useHomeFeed()

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState message="Couldn't load the feed. Try again." />

  const items = data?.pages.flatMap((p) => p.items) ?? []
  const [lead, ...rest] = items
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
        <>
          <LeadStoryCard item={lead} />
          {rest.length > 0 && (
            <div className="feed-grid">
              {rest.map((item) => (
                <FeedItemCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </>
      )}

      {hasNextPage && <LoadMoreButton onClick={() => fetchNextPage()} loading={isFetchingNextPage} />}

      <div className="band-alt">
        <div className="band-alt-inner">
          <div>
            <SectionEyebrow>About Newstack</SectionEyebrow>
            <p className="band-alt-quote" aria-hidden>&ldquo;</p>
          </div>
          <div className="flex flex-col gap-4">
            <h2 className="band-alt-heading">Why we show you the whole spread</h2>
            <div className="band-alt-body">
              <p>
                Most outlets cover the same story differently — not just in tone, but in which facts lead and which
                get left out. Newstack puts those versions side by side, rated independently for bias and factuality,
                so you can see the full spread before deciding what to trust.
              </p>
              <p>
                Bias and factuality are never combined into a single score. Our method and every source's rating
                history are public, so you can check our work the same way we ask you to check the news.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
