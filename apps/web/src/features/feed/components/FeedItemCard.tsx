import { Link } from 'react-router-dom'

import { SaveToggleButton } from '../../saved'
import type { FeedItem } from '../types'
import { BiasBar } from './BiasBar'

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const hours = Math.round(ms / 3_600_000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export function FeedItemCard({ item }: { item: FeedItem }) {
  return (
    <article className="flex flex-col gap-3 p-4" style={{ background: 'var(--color-surface)' }}>
      <div className="flex items-center gap-2 text-xs text-muted">
        <span>{item.ratedSourceCount + item.unratedSourceCount} sources</span>
        <span>·</span>
        <span>{timeAgo(item.lastCoverageAt)}</span>
      </div>
      <h2 className="article-headline" style={{ fontSize: '19px', textWrap: 'pretty' }}>
        <Link to={`/stories/${item.id}`} className="hover:underline">
          {item.title}
        </Link>
      </h2>
      {item.summary !== null && <p className="line-clamp-2 text-sm opacity-80">{item.summary}</p>}
      <BiasBar bar={item.biasBar} />
      <div className="mt-auto flex items-center justify-between pt-1">
        <Link to={`/stories/${item.id}`} className="text-xs font-semibold" style={{ color: 'var(--color-accent-700)' }}>
          Compare headlines →
        </Link>
        <SaveToggleButton kind="stories" id={item.id} />
      </div>
    </article>
  )
}
