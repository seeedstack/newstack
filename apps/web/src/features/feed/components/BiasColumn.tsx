import { SaveToggleButton } from '../../saved'
import type { SourceCard } from '../types'

export function BiasColumn({ label, colorClass, cards }: { label: string; colorClass: string; cards: SourceCard[] }) {
  if (cards.length === 0) return null

  return (
    <div className="min-w-0">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${colorClass}`} />
        {label}
      </h3>
      <ul className="flex flex-col gap-3">
        {cards.map((card) => (
          <li key={card.sourceId} className="text-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{card.sourceName}</p>
              <SaveToggleButton kind="sources" id={card.sourceId} />
            </div>
            <a
              href={card.primaryArticle.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-neutral-700 hover:underline dark:text-neutral-300"
            >
              {card.primaryArticle.title}
            </a>
            {card.moreCount > 0 && (
              <p className="text-xs text-neutral-500">+{card.moreCount} more from {card.sourceName}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
