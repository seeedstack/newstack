import type { BiasBar as BiasBarData } from '../types'

// Fixed order + diverging 5-step scale, pinned by ARCHITECTURE §10. Segments with zero
// count are omitted from the bar itself (nothing to show) but still counted below.
const SEGMENTS: { key: keyof Omit<BiasBarData, 'notRated'>; label: string; colorClass: string }[] = [
  { key: 'left', label: 'left-leaning', colorClass: 'bg-bias-left' },
  { key: 'centerLeft', label: 'center-left', colorClass: 'bg-bias-centerleft' },
  { key: 'center', label: 'center', colorClass: 'bg-bias-center' },
  { key: 'centerRight', label: 'center-right', colorClass: 'bg-bias-centerright' },
  { key: 'right', label: 'right-leaning', colorClass: 'bg-bias-right' },
]

export function BiasBar({ bar }: { bar: BiasBarData }) {
  const ratedTotal = SEGMENTS.reduce((sum, s) => sum + bar[s.key].count, 0)
  const unrated = bar.notRated.count

  if (ratedTotal === 0) {
    return <p className="text-sm text-neutral-500">No rated sources yet</p>
  }

  // PRODUCT §3.5 pinned phrasing: counts, never percentages or a single bias label.
  const summary = `${ratedTotal} rated sources covered this story — ${SEGMENTS.map(
    (s) => `${bar[s.key].count} ${s.label}`
  ).join(', ')}`

  return (
    <div>
      <div
        role="img"
        aria-label={summary}
        title={summary}
        className="flex h-3 w-full overflow-hidden rounded-full"
      >
        {SEGMENTS.map((s) => {
          const segment = bar[s.key]
          if (segment.count === 0) return null
          const widthPct = (segment.count / ratedTotal) * 100
          return (
            <div
              key={s.key}
              className={`${s.colorClass} h-full border-r-2 border-white last:border-r-0 dark:border-neutral-950`}
              style={{ width: `${widthPct}%` }}
              title={`${segment.count} ${s.label}${segment.lowConfidenceCount > 0 ? ` (${segment.lowConfidenceCount} low confidence)` : ''}`}
            />
          )
        })}
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        {ratedTotal} rated sources{unrated > 0 ? ` · unrated: ${unrated}` : ''} · Based on current source ratings
      </p>
    </div>
  )
}
