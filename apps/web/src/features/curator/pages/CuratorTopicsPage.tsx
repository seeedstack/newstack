import { useState, type FormEvent } from 'react'

import { useCreateTopic } from '../hooks/useCuratorMutations'

const inputClass = 'rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900'

export function CuratorTopicsPage() {
  const [name, setName] = useState('')
  const [keywordsText, setKeywordsText] = useState('')
  const [createdBy, setCreatedBy] = useState('')
  const createTopic = useCreateTopic()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const keywords = keywordsText.split(',').map((k) => k.trim()).filter((k) => k.length > 0)
    createTopic.mutate({ name, keywords, createdBy })
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Topics</h1>
      <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-3">
        <input required placeholder="Topic name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        <input
          required
          placeholder="Keywords, comma-separated (e.g. AI, Modi, C++)"
          value={keywordsText}
          onChange={(e) => setKeywordsText(e.target.value)}
          className={inputClass}
        />
        <p className="text-xs text-neutral-500">
          Normalized server-side: casefold, NFC, dedup, 2-64 chars, 1-20 keywords, Latin script only (ARCHITECTURE §10).
        </p>
        <input required placeholder="Created by (curator)" value={createdBy} onChange={(e) => setCreatedBy(e.target.value)} className={inputClass} />
        {createTopic.isError && <p className="text-sm text-red-700 dark:text-red-400">Couldn't create that topic.</p>}
        {createTopic.isSuccess && <p className="text-sm text-green-700 dark:text-green-400">Topic created: {createTopic.data.id}</p>}
        <button type="submit" disabled={createTopic.isPending} className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">
          {createTopic.isPending ? 'Creating…' : 'Create topic'}
        </button>
      </form>
    </div>
  )
}
