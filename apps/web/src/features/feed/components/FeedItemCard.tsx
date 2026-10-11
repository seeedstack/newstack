import { Link } from 'react-router-dom'

import type { FeedItem } from '../types'
import { BiasBar } from './BiasBar'

export function FeedItemCard({ item }: { item: FeedItem }) {
  return (
    <article className="rounded border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="text-lg font-medium">
        <Link to={`/stories/${item.id}`} className="hover:underline">
          {item.title}
        </Link>
      </h2>
      {item.summary !== null && <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{item.summary}</p>}
      <div className="mt-3">
        <BiasBar bar={item.biasBar} />
      </div>
    </article>
  )
}
