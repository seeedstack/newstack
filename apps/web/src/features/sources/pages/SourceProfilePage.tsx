import { useNavigate, useParams } from 'react-router-dom'

import { Button } from '../../../components/ui/Button'
import { IconAlert, IconArrowLeft } from '../../../components/ui/icons'
import { Tag } from '../../../components/ui/Tag'
import { EmptyState, ErrorState, LoadingState } from '../../../components/QueryStates'
import { SaveToggleButton } from '../../saved'
import { useSource, useSourceRatings } from '../hooks/useSource'

function monogram(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase()
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function SourceProfilePage() {
  const { id } = useParams<{ id: string }>()
  const sourceId = id ?? ''
  const navigate = useNavigate()
  const { data: source, error, isLoading } = useSource(sourceId)
  const { data: ratings } = useSourceRatings(sourceId)

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState message="Couldn't load this source." />
  if (source === undefined) return <EmptyState message="Source not found." />

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" onClick={() => navigate(-1)} className="self-start">
        <IconArrowLeft size={16} />
        Back
      </Button>

      {source.status === 'deprecated' && (
        <div className="flex items-center gap-3 p-3" style={{ background: 'var(--color-danger-100)', border: '2px solid var(--color-danger)' }}>
          <IconAlert size={18} style={{ color: 'var(--color-danger-700)' }} />
          <div className="flex-1" style={{ color: 'var(--color-danger-800)' }}>
            <p className="font-semibold">No longer updated</p>
            <p className="text-sm">This source is deprecated. Its last rating stays visible.</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start gap-4" style={{ borderBottom: '2px solid var(--color-divider)', paddingBottom: 'var(--space-4)' }}>
        <div
          className="flex h-[72px] w-[72px] flex-none items-center justify-center text-xl"
          style={{ background: 'var(--color-accent)', color: 'var(--color-bg)', fontFamily: 'var(--font-heading)', fontWeight: 'var(--font-heading-weight)' }}
        >
          {monogram(source.name)}
        </div>
        <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
          <h1>{source.name}</h1>
          <a href={`https://${source.domain}`} target="_blank" rel="noopener noreferrer" className="text-sm" style={{ color: 'var(--color-accent)' }}>
            {source.domain} ↗
          </a>
        </div>
        <SaveToggleButton kind="sources" id={source.id} />
      </div>

      {ratings?.current && (
        <div className="flex flex-wrap gap-2">
          {ratings.current.biasRating !== null && <Tag variant="accent">{ratings.current.biasRating}</Tag>}
          <Tag variant="neutral">{ratings.current.factuality} factuality</Tag>
        </div>
      )}
      <p className="text-muted text-xs">Bias and factuality are rated separately and never combined into one score.</p>

      <div className="flex flex-col gap-3">
        <h3>Rating history</h3>
        {ratings === undefined || ratings.history.length === 0 ? (
          <p className="text-muted text-sm">No ratings yet.</p>
        ) : (
          <div className="overflow-x-auto" style={{ borderTop: '2px solid var(--color-divider)' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Rated by</th>
                  <th>Method</th>
                  <th>Bias</th>
                  <th>Factuality</th>
                </tr>
              </thead>
              <tbody>
                {ratings.history.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.ratedAt)}</td>
                    <td>{r.ratedBy}</td>
                    <td>{r.method}</td>
                    <td>{r.biasRating ?? '—'}</td>
                    <td>{r.factuality}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
