import { Link } from 'react-router-dom'

import { SaveToggleButton } from '../../saved'
import type { FeedItem } from '../types'
import { timeAgo } from '../timeAgo'
import { BiasBar } from './BiasBar'

// FeedItem has no image field (openapi.yaml) — the lead-story layout always uses
// the full-width "no image" branch of UI_PORT_SPEC.md §4.5.
export function LeadStoryCard({ item }: { item: FeedItem }) {
  const sourceCount = item.ratedSourceCount + item.unratedSourceCount

  return (
    <article className="lead-story">
      <div className="kicker">
        <span className="kicker-rule" aria-hidden />
        <span>{sourceCount} {sourceCount === 1 ? 'Source' : 'Sources'}</span>
      </div>
      <p className="text-muted text-xs">{timeAgo(item.lastCoverageAt)}</p>
      <h2 style={{ margin: 0 }}>
        <Link to={`/stories/${item.id}`} className="lead-headline">
          {item.title}
        </Link>
      </h2>
      {item.summary !== null && <p className="lead-summary">{item.summary}</p>}
      <BiasBar bar={item.biasBar} />
      <div className="flex items-center justify-between pt-1">
        <Link to={`/stories/${item.id}`} className="text-xs font-semibold" style={{ color: 'var(--color-accent-700)' }}>
          Compare headlines →
        </Link>
        <SaveToggleButton kind="stories" id={item.id} />
      </div>
    </article>
  )
}
