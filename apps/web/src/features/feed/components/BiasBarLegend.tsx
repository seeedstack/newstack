import { useSourceDistribution } from '../hooks/useSourceDistribution'
import type { SourceDistribution } from '../types'

// Replaces the old static color-key list with the real site-wide spread, so color identity
// is taught by an actual weighted bar instead of a swatch+label legend. PRODUCT §3.5 still
// applies here even though this isn't a per-story bar: counts, never a single left/right score.
const SEGMENTS: { key: keyof Omit<SourceDistribution, 'notRated'>; label: string; colorClass: string }[] = [
  { key: 'left', label: 'left', colorClass: 'bg-bias-left' },
  { key: 'centerLeft', label: 'center-left', colorClass: 'bg-bias-centerleft' },
  { key: 'center', label: 'center', colorClass: 'bg-bias-center' },
  { key: 'centerRight', label: 'center-right', colorClass: 'bg-bias-centerright' },
  { key: 'right', label: 'right', colorClass: 'bg-bias-right' },
]

export function BiasBarLegend() {
  const { data } = useSourceDistribution()
  if (data === undefined) return null

  const ratedTotal = SEGMENTS.reduce((sum, s) => sum + data[s.key], 0)
  if (ratedTotal === 0) return null

  const summary = `${ratedTotal} rated sources we track — ${SEGMENTS.map((s) => `${data[s.key]} ${s.label}`).join(', ')}`

  return (
    <div className="flex flex-col gap-1">
      <div role="img" aria-label={summary} title={summary} className="flex h-2 w-40 gap-0.5">
        {SEGMENTS.map((s) => {
          const count = data[s.key]
          if (count === 0) return null
          return <div key={s.key} className={`${s.colorClass} h-full`} style={{ width: `${(count / ratedTotal) * 100}%` }} title={`${count} ${s.label}`} />
        })}
      </div>
      <p className="text-muted text-xs">{ratedTotal} sources we rate, left to right</p>
    </div>
  )
}
