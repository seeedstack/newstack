import { useNavigate, useParams } from 'react-router-dom'

import { Button } from '../../../components/ui/Button'
import { IconAlert, IconArrowLeft } from '../../../components/ui/icons'
import { Tag } from '../../../components/ui/Tag'
import { EmptyState, ErrorState, LoadingState } from '../../../components/QueryStates'
import { SaveToggleButton } from '../../saved'
import { GEO_TOPIC_ORDER, GEO_TOPICS, stanceLabel } from '../geoTopics'
import { useSource, useSourceGeoRatings, useSourceOwnership, useSourceRatings, useSourceSensationalism } from '../hooks/useSource'
import { OWNERSHIP_TRANSPARENCY_LABEL, SENSATIONALISM_LABEL } from '../labels'

const EDITORIAL_INDEPENDENCE_LABEL: Record<string, string> = {
  no_documented_influence: 'No documented editorial influence',
  documented_instances: 'Documented instances of influence',
  insufficient_evidence: 'Editorial independence: insufficient evidence',
}

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
  const { data: sensationalism } = useSourceSensationalism(sourceId)
  const { data: ownership } = useSourceOwnership(sourceId)
  const { data: geoRatings } = useSourceGeoRatings(sourceId)

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

      {(ratings?.current || sensationalism?.current) && (
        <div className="flex flex-wrap gap-2">
          {ratings?.current?.biasRating != null && <Tag variant="accent">{ratings.current.biasRating}</Tag>}
          {ratings?.current && <Tag variant="neutral">{ratings.current.factuality} factuality</Tag>}
          {sensationalism?.current && <Tag variant="outline">{SENSATIONALISM_LABEL[sensationalism.current.level]}</Tag>}
        </div>
      )}
      <p className="text-muted text-xs">
        Bias, factuality, sensationalism, geopolitical positioning, and ownership are rated independently and never combined
        into one score.
      </p>

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

      <div className="flex flex-col gap-3">
        <h3>Ownership and editorial independence</h3>
        {ownership === null || ownership === undefined ? (
          <p className="text-muted text-sm">Not yet researched.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Tag variant="neutral">{OWNERSHIP_TRANSPARENCY_LABEL[ownership.ownershipTransparency]}</Tag>
              <Tag variant="neutral">{EDITORIAL_INDEPENDENCE_LABEL[ownership.editorialIndependence]}</Tag>
            </div>
            {ownership.notes && <p className="text-muted text-sm">{ownership.notes}</p>}
          </>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h3>Geopolitical positioning</h3>
        <p className="text-muted text-xs">
          Rated per topic, independent of domestic bias — most outlets carry no rating on most topics.
        </p>
        <div className="flex flex-col gap-2">
          {GEO_TOPIC_ORDER.map((topic) => {
            const entry = geoRatings?.[topic]?.current ?? null
            return (
              <div key={topic} className="flex flex-wrap items-center justify-between gap-2 text-sm" style={{ borderBottom: '1px solid var(--color-divider)', paddingBottom: 'var(--space-2)' }}>
                <span>{GEO_TOPICS[topic].label}</span>
                {entry === null ? (
                  <span className="text-muted">Not yet assessed</span>
                ) : (
                  <Tag variant="outline">{stanceLabel(topic, entry.stance)}</Tag>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
