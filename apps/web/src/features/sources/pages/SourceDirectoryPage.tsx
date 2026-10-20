import { useState } from 'react'
import { Link } from 'react-router-dom'

import { EmptyState, ErrorState, LoadingState, LoadMoreButton } from '../../../components/QueryStates'
import { Tag } from '../../../components/ui/Tag'
import { useSourceList } from '../hooks/useSource'
import type { SourceCategory } from '../types'

const CATEGORIES: { value: SourceCategory; label: string }[] = [
  { value: 'national', label: 'National' },
  { value: 'regional', label: 'Regional' },
  { value: 'language', label: 'Language' },
  { value: 'business', label: 'Business' },
  { value: 'geopolitical', label: 'Geopolitical' },
  { value: 'specialist', label: 'Specialist' },
]

const PAGE_SIZE = 20

export function SourceDirectoryPage() {
  const [q, setQ] = useState('')
  const [category, setCategory] = useState<SourceCategory | undefined>(undefined)
  const [country, setCountry] = useState('')
  const [language, setLanguage] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)

  const { data, error, isLoading, isFetching } = useSourceList({ q, category, country, language, limit })

  return (
    <div className="flex flex-col gap-6">
      <h1 className="article-headline">Source directory</h1>

      <div className="flex flex-col gap-3">
        <input
          type="search"
          placeholder="Search by name"
          value={q}
          onChange={(e) => {
            setLimit(PAGE_SIZE)
            setQ(e.target.value)
          }}
          className="input max-w-sm"
        />
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => {
                setLimit(PAGE_SIZE)
                setCategory(category === c.value ? undefined : c.value)
              }}
              className="tag tag-outline"
              style={category === c.value ? { background: 'var(--color-accent)', color: 'var(--color-bg)' } : undefined}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            placeholder="Country (IN, US, …)"
            value={country}
            onChange={(e) => {
              setLimit(PAGE_SIZE)
              setCountry(e.target.value.toUpperCase())
            }}
            className="input max-w-[160px]"
          />
          <input
            placeholder="Language (en, hi, …)"
            value={language}
            onChange={(e) => {
              setLimit(PAGE_SIZE)
              setLanguage(e.target.value.toLowerCase())
            }}
            className="input max-w-[160px]"
          />
        </div>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message="Couldn't load the source directory." />
      ) : data === undefined || data.items.length === 0 ? (
        <EmptyState message="No sources match these filters." />
      ) : (
        <>
          <p className="text-muted text-sm">
            {data.total} source{data.total === 1 ? '' : 's'}
          </p>
          <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2 lg:grid-cols-3" style={{ background: 'var(--color-divider)', border: '2px solid var(--color-divider)' }}>
            {data.items.map((source) => (
              <Link
                key={source.id}
                to={`/sources/${source.id}`}
                className="flex flex-col gap-1.5 p-4 hover:underline"
                style={{ background: 'var(--color-bg)' }}
              >
                <span className="text-sm font-semibold">{source.name}</span>
                <span className="text-muted text-xs">
                  {source.countryCode} · {source.language}
                </span>
                {source.categories.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {source.categories.map((cat) => (
                      <Tag key={cat} variant="neutral">
                        {cat}
                      </Tag>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
          {data.items.length < data.total && (
            <LoadMoreButton onClick={() => setLimit((l) => l + PAGE_SIZE)} loading={isFetching} />
          )}
        </>
      )}
    </div>
  )
}
