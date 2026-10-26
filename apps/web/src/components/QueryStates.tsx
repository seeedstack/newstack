import { Button } from './ui/Button'

export function ErrorState({ message }: { message: string }) {
  return (
    <p
      style={{ background: 'var(--color-danger-100)', borderColor: 'var(--color-danger)', color: 'var(--color-danger-800)' }}
      className="border-2 p-4 text-sm"
    >
      {message}
    </p>
  )
}

export function LoadingState() {
  return <p className="text-muted p-4 text-sm">Loading…</p>
}

export function EmptyState({ message }: { message: string }) {
  return <p className="text-muted p-4 text-sm">{message}</p>
}

export function LoadMoreButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <Button onClick={onClick} disabled={loading} className="mx-auto">
      {loading ? 'Loading…' : 'Load more'}
    </Button>
  )
}
