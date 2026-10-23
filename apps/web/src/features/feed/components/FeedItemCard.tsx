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
  const sourceCount = item.ratedSourceCount + item.unratedSourceCount

  return (
    <article className="feed-card">
      <div className="kicker">
        <span className="kicker-rule" aria-hidden />
        <span>{sourceCount} {sourceCount === 1 ? 'Source' : 'Sources'}</span>
      </div>
      <p className="text-muted text-xs">{timeAgo(item.lastCoverageAt)}</p>
      <h2 style={{ margin: 0 }}>
        <Link to={`/stories/${item.id}`} className="headline-link">
          {item.title}
        </Link>
      </h2>
      {item.summary !== null && (
        <p className="line-clamp-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{item.summary}</p>
      )}
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
