export function ErrorState({ message }: { message: string }) {
  return <p className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{message}</p>
}

export function LoadingState() {
  return <p className="p-4 text-sm text-neutral-500">Loading…</p>
}

export function EmptyState({ message }: { message: string }) {
  return <p className="p-4 text-sm text-neutral-500">{message}</p>
}

export function LoadMoreButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="mx-auto block rounded border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
    >
      {loading ? 'Loading…' : 'Load more'}
    </button>
  )
}
