// Shown once per page (not per bar) so color identity never relies on color alone —
// each bar's own hover/tap title carries the exact counts (ARCHITECTURE §10).
const ENTRIES = [
  { label: 'Left', colorClass: 'bg-bias-left' },
  { label: 'Center-left', colorClass: 'bg-bias-centerleft' },
  { label: 'Center', colorClass: 'bg-bias-center' },
  { label: 'Center-right', colorClass: 'bg-bias-centerright' },
  { label: 'Right', colorClass: 'bg-bias-right' },
  { label: 'Unrated', colorClass: 'bg-bias-unrated' },
]

export function BiasBarLegend() {
  return (
    <ul className="flex flex-wrap gap-3 text-xs text-neutral-500">
      {ENTRIES.map((e) => (
        <li key={e.label} className="flex items-center gap-1.5">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${e.colorClass}`} />
          {e.label}
        </li>
      ))}
    </ul>
  )
}
