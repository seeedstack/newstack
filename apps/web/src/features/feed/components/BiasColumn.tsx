import { Link } from 'react-router-dom'

import { SaveToggleButton } from '../../saved'
import type { SourceCard } from '../types'

export function BiasColumn({ label, colorClass, cards }: { label: string; colorClass: string; cards: SourceCard[] }) {
  if (cards.length === 0) return null

  return (
    <div className="flex min-w-0 flex-col" style={{ background: 'var(--color-bg)' }}>
      <div className="flex items-center gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ borderBottom: '2px solid var(--color-divider)' }}>
        <span className={`inline-block h-2.5 w-2.5 ${colorClass}`} />
        {label}
      </div>
      <ul className="flex flex-1 flex-col">
        {cards.map((card) => (
          <li key={card.sourceId} className="flex flex-col gap-1.5 p-4" style={{ borderBottom: '1px solid var(--color-divider)' }}>
            <div className="flex items-center justify-between gap-2">
              <Link to={`/sources/${card.sourceId}`} className="text-sm font-semibold hover:underline">
                {card.sourceName}
              </Link>
              <SaveToggleButton kind="sources" id={card.sourceId} />
            </div>
            <a
              href={card.primaryArticle.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-sm hover:underline"
              style={{ fontFamily: 'var(--font-heading)', fontWeight: 'var(--font-heading-weight)', lineHeight: 1.25 }}
            >
              {card.primaryArticle.title}
            </a>
            {card.moreCount > 0 && <p className="text-muted text-xs">+{card.moreCount} more from {card.sourceName}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}
