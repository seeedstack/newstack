import { useState } from 'react'

import { EmptyState, ErrorState, LoadingState, LoadMoreButton } from '../../../components/QueryStates'
import { useClusterReports } from '../hooks/useCuratorMutations'

const PAGE_SIZE = 20

const KIND_LABEL: Record<string, string> = {
  wrong_merge: 'Wrong merge',
  should_merge: 'Should merge',
}

export function CuratorClusterReportsPage() {
  const [resolved, setResolved] = useState<boolean | undefined>(false)
  const [limit, setLimit] = useState(PAGE_SIZE)

  const { data, error, isLoading, isFetching } = useClusterReports({ resolved, limit, offset: 0 })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Cluster error reports</h1>
        <p className="text-xs text-neutral-500">
          Filed via the clustering-error report form on the Moderation tab (ARCHITECTURE §7). Read-only for now — nothing
          marks a report resolved yet.
        </p>
      </div>

      <div className="flex gap-2">
        {([
          { value: false, label: 'Open' },
          { value: true, label: 'Resolved' },
          { value: undefined, label: 'All' },
        ] as const).map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => {
              setLimit(PAGE_SIZE)
              setResolved(opt.value)
            }}
            className={`rounded px-3 py-1 text-sm ${
              resolved === opt.value
                ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                : 'border border-neutral-300 dark:border-neutral-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message="Couldn't load the cluster report queue." />
      ) : data === undefined || data.items.length === 0 ? (
        <EmptyState message="No reports match this filter." />
      ) : (
        <>
          <p className="text-xs text-neutral-500">
            {data.total} report{data.total === 1 ? '' : 's'}
          </p>
          <ul className="flex flex-col gap-3">
            {data.items.map((item) => (
              <li key={item.id} className="rounded border border-neutral-200 p-4 dark:border-neutral-800">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{KIND_LABEL[item.kind] ?? item.kind}</span>
                  <span className="text-xs text-neutral-500">{new Date(item.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-1 text-sm">
                  Story: <span className="font-medium">{item.storyTitle}</span>
                </p>
                {item.articleTitle !== null && (
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">Flagged article: {item.articleTitle}</p>
                )}
                {item.otherStoryTitle !== null && (
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">Duplicate of: {item.otherStoryTitle}</p>
                )}
                <p className="mt-1 text-xs text-neutral-500">
                  Reported by {item.reportedBy} · {item.resolvedAt === null ? 'open' : `resolved ${new Date(item.resolvedAt).toLocaleString()}`}
                </p>
              </li>
            ))}
          </ul>
          {data.items.length < data.total && <LoadMoreButton onClick={() => setLimit((l) => l + PAGE_SIZE)} loading={isFetching} />}
        </>
      )}
    </div>
  )
}
