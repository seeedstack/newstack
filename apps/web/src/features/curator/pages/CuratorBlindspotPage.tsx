import { Link } from 'react-router-dom'

import { EmptyState, ErrorState, LoadingState, LoadMoreButton } from '../../../components/QueryStates'
import { useBlindspotFeed } from '../hooks/useCuratorMutations'

// PRODUCT §4.7 pinned phrasing: "Little coverage from X-leaning sources", never
// "Blindspot: X" (readers parse that both ways).
function sideLabel(side: 'L' | 'R'): string {
  return side === 'L' ? 'Little coverage from left-leaning sources' : 'Little coverage from right-leaning sources'
}

export function CuratorBlindspotPage() {
  const { data, error, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage } = useBlindspotFeed()

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState message="Couldn't load the blindspot feed." />

  const items = data?.pages.flatMap((p) => p.items) ?? []

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Blindspot feed</h1>
        <p className="text-xs text-neutral-500">
          Curator-only until a calibration round meets PRODUCT §4.9's release bars.
        </p>
      </div>
      {items.length === 0 ? (
        <EmptyState message="No flagged stories in the last 7 days." />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            const total = item.countedLeft + item.countedCenter + item.countedRight
            return (
              <li key={item.id} className="rounded border border-neutral-200 p-4 dark:border-neutral-800">
                <Link to={`/stories/${item.id}`} className="font-medium hover:underline">
                  {item.title}
                </Link>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{sideLabel(item.side)}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  {total} rated sources covered this: {item.countedLeft} left-leaning, {item.countedCenter} center,{' '}
                  {item.countedRight} right-leaning
                </p>
              </li>
            )
          })}
        </ul>
      )}
      {hasNextPage && <LoadMoreButton onClick={() => fetchNextPage()} loading={isFetchingNextPage} />}
    </div>
  )
}
