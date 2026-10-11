import { useState, type FormEvent } from 'react'

import { useHideArticle, useHideStory, useReportClusterError } from '../hooks/useCuratorMutations'
import type { ClusterReportKind } from '../types'

const inputClass = 'rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900'

function HideArticleForm() {
  const [id, setId] = useState('')
  const [reason, setReason] = useState<'takedown' | 'spam' | 'duplicate' | 'canonical_duplicate'>('takedown')
  const hideArticle = useHideArticle()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    hideArticle.mutate({ id, reason })
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-3">
      <h2 className="text-lg font-medium">Hide an article</h2>
      <input required placeholder="Article id" value={id} onChange={(e) => setId(e.target.value)} className={inputClass} />
      <select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)} className={inputClass}>
        <option value="takedown">Takedown</option>
        <option value="spam">Spam</option>
        <option value="duplicate">Duplicate</option>
        <option value="canonical_duplicate">Canonical duplicate</option>
      </select>
      {hideArticle.isSuccess && <p className="text-sm text-green-700 dark:text-green-400">Article hidden.</p>}
      {hideArticle.isError && <p className="text-sm text-red-700 dark:text-red-400">Couldn't hide that article.</p>}
      <button type="submit" disabled={hideArticle.isPending} className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">
        {hideArticle.isPending ? 'Hiding…' : 'Hide article'}
      </button>
    </form>
  )
}

function HideStoryForm() {
  const [id, setId] = useState('')
  const hideStory = useHideStory()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    hideStory.mutate(id)
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-3">
      <h2 className="text-lg font-medium">Hide a story</h2>
      <input required placeholder="Story id" value={id} onChange={(e) => setId(e.target.value)} className={inputClass} />
      {hideStory.isSuccess && <p className="text-sm text-green-700 dark:text-green-400">Story hidden from public feeds.</p>}
      {hideStory.isError && <p className="text-sm text-red-700 dark:text-red-400">Couldn't hide that story.</p>}
      <button type="submit" disabled={hideStory.isPending} className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">
        {hideStory.isPending ? 'Hiding…' : 'Hide story'}
      </button>
    </form>
  )
}

function ClusterReportForm() {
  const [kind, setKind] = useState<ClusterReportKind>('wrong_merge')
  const [storyId, setStoryId] = useState('')
  const [articleId, setArticleId] = useState('')
  const [otherStoryId, setOtherStoryId] = useState('')
  const [reportedBy, setReportedBy] = useState('')
  const report = useReportClusterError()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    report.mutate({
      kind,
      storyId,
      reportedBy,
      articleId: kind === 'wrong_merge' ? articleId : undefined,
      otherStoryId: kind === 'should_merge' ? otherStoryId : undefined,
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-3">
      <h2 className="text-lg font-medium">Report a clustering error</h2>
      <select value={kind} onChange={(e) => setKind(e.target.value as ClusterReportKind)} className={inputClass}>
        <option value="wrong_merge">Wrong merge (article doesn't belong)</option>
        <option value="should_merge">Should merge (two stories are the same event)</option>
      </select>
      <input required placeholder="Story id" value={storyId} onChange={(e) => setStoryId(e.target.value)} className={inputClass} />
      {kind === 'wrong_merge' && (
        <input required placeholder="Article id" value={articleId} onChange={(e) => setArticleId(e.target.value)} className={inputClass} />
      )}
      {kind === 'should_merge' && (
        <input required placeholder="Other story id" value={otherStoryId} onChange={(e) => setOtherStoryId(e.target.value)} className={inputClass} />
      )}
      <input required placeholder="Reported by (curator)" value={reportedBy} onChange={(e) => setReportedBy(e.target.value)} className={inputClass} />
      {report.isSuccess && <p className="text-sm text-green-700 dark:text-green-400">Report recorded: {report.data.id}</p>}
      {report.isError && <p className="text-sm text-red-700 dark:text-red-400">Couldn't record that report.</p>}
      <button type="submit" disabled={report.isPending} className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">
        {report.isPending ? 'Reporting…' : 'Report'}
      </button>
    </form>
  )
}

export function CuratorModerationPage() {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Moderation</h1>
      <HideArticleForm />
      <HideStoryForm />
      <ClusterReportForm />
    </div>
  )
}
