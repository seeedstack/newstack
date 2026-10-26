import { useState, type FormEvent } from 'react'

import { CuratorApiError } from '../lib/curatorFetch'
import { useOnboardSource, useSetSourceCategories, useSubmitRating } from '../hooks/useCuratorMutations'
import type { BiasRating, Confidence } from '../types'

const inputClass = 'rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900'

// PRODUCT §5.9's fixed list; multi-valued, curator-assigned, never derived.
const CATEGORIES = ['national', 'regional', 'language', 'business', 'geopolitical', 'specialist'] as const

function AssignCategoriesForm() {
  const [sourceId, setSourceId] = useState('')
  const [categories, setCategories] = useState<Set<string>>(new Set())
  const setSourceCategories = useSetSourceCategories()

  function toggle(category: string) {
    setCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSourceCategories.mutate({ sourceId, categories: [...categories] })
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-3">
      <h2 className="text-lg font-medium">Assign directory categories</h2>
      <p className="text-xs text-neutral-500">
        Replaces the source's whole category set (PRODUCT §5.9) — a descriptive tag, not a rating.
      </p>
      <input required placeholder="Source id" value={sourceId} onChange={(e) => setSourceId(e.target.value)} className={inputClass} />
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((category) => (
          <label key={category} className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={categories.has(category)} onChange={() => toggle(category)} />
            {category}
          </label>
        ))}
      </div>
      {setSourceCategories.isError && <p className="text-sm text-red-700 dark:text-red-400">Couldn't set categories.</p>}
      {setSourceCategories.isSuccess && <p className="text-sm text-green-700 dark:text-green-400">Categories updated.</p>}
      <button
        type="submit"
        disabled={setSourceCategories.isPending}
        className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {setSourceCategories.isPending ? 'Saving…' : 'Save categories'}
      </button>
    </form>
  )
}

function OnboardSourceForm() {
  const [form, setForm] = useState({ name: '', domain: '', countryCode: 'IN', language: 'en', feedTimezone: 'Asia/Kolkata' })
  const onboard = useOnboardSource()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    onboard.mutate(form)
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-3">
      <h2 className="text-lg font-medium">Onboard a source</h2>
      <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
      <input required placeholder="Domain" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} className={inputClass} />
      <input required placeholder="Country code (IN)" value={form.countryCode} onChange={(e) => setForm({ ...form, countryCode: e.target.value })} className={inputClass} />
      <input required placeholder="Language (en)" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} className={inputClass} />
      <input
        required
        placeholder="Feed timezone (Asia/Kolkata)"
        value={form.feedTimezone}
        onChange={(e) => setForm({ ...form, feedTimezone: e.target.value })}
        className={inputClass}
      />
      {onboard.isError && <p className="text-sm text-red-700 dark:text-red-400">Couldn't onboard that source.</p>}
      {onboard.isSuccess && <p className="text-sm text-green-700 dark:text-green-400">Source created: {onboard.data.id}</p>}
      <button type="submit" disabled={onboard.isPending} className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">
        {onboard.isPending ? 'Creating…' : 'Create source'}
      </button>
    </form>
  )
}

function RateSourceForm() {
  const [sourceId, setSourceId] = useState('')
  const [biasRating, setBiasRating] = useState<BiasRating | ''>('')
  const [factuality, setFactuality] = useState<'high' | 'mixed' | 'low'>('high')
  const [confidence, setConfidence] = useState<Confidence | ''>('')
  const [ratedBy, setRatedBy] = useState('')
  const [secondRater, setSecondRater] = useState('')
  const [evidenceText, setEvidenceText] = useState('')
  const [rubricScoresJson, setRubricScoresJson] = useState('')
  const submitRating = useSubmitRating()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const evidence = evidenceText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
    let rubricScores: Record<string, unknown> | null = null
    if (rubricScoresJson.trim() !== '') {
      try {
        rubricScores = JSON.parse(rubricScoresJson)
      } catch {
        return
      }
    }
    submitRating.mutate({
      sourceId,
      input: {
        spectrum: biasRating === '' ? null : 'IN',
        biasRating: biasRating === '' ? null : biasRating,
        factuality,
        confidence: confidence === '' ? null : confidence,
        method: 'manual-curation',
        ratedBy,
        secondRater: secondRater === '' ? null : secondRater,
        rubricScores,
        evidence: evidence.length > 0 ? evidence : null,
      },
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-3">
      <h2 className="text-lg font-medium">Submit a rating</h2>
      <p className="text-xs text-neutral-500">
        Manual-curation rubric v1 (PRODUCT §5.2) — two distinct raters, rubric scores, and at least 3 evidence items.
      </p>
      <input required placeholder="Source id" value={sourceId} onChange={(e) => setSourceId(e.target.value)} className={inputClass} />
      <select value={biasRating} onChange={(e) => setBiasRating(e.target.value as BiasRating | '')} className={inputClass}>
        <option value="">Factuality-only (no bias rating)</option>
        <option value="left">Left</option>
        <option value="center-left">Center-left</option>
        <option value="center">Center</option>
        <option value="center-right">Center-right</option>
        <option value="right">Right</option>
      </select>
      <select value={factuality} onChange={(e) => setFactuality(e.target.value as 'high' | 'mixed' | 'low')} className={inputClass}>
        <option value="high">Factuality: high</option>
        <option value="mixed">Factuality: mixed</option>
        <option value="low">Factuality: low</option>
      </select>
      <select value={confidence} onChange={(e) => setConfidence(e.target.value as Confidence | '')} className={inputClass}>
        <option value="">Confidence: (none)</option>
        <option value="high">Confidence: high</option>
        <option value="medium">Confidence: medium</option>
        <option value="low">Confidence: low (hatched, excluded from blindspot)</option>
      </select>
      <input required placeholder="Rated by (curator)" value={ratedBy} onChange={(e) => setRatedBy(e.target.value)} className={inputClass} />
      <input placeholder="Second rater (required for manual-curation)" value={secondRater} onChange={(e) => setSecondRater(e.target.value)} className={inputClass} />
      <textarea
        placeholder="Evidence (one URL/note per line, 3+ required for manual-curation)"
        value={evidenceText}
        onChange={(e) => setEvidenceText(e.target.value)}
        className={`${inputClass} h-20`}
      />
      <textarea
        placeholder='Rubric scores as JSON, e.g. {"framing": 2, "sourcing": 1}'
        value={rubricScoresJson}
        onChange={(e) => setRubricScoresJson(e.target.value)}
        className={`${inputClass} h-16`}
      />
      {submitRating.isError && (
        <p className="text-sm text-red-700 dark:text-red-400">
          {submitRating.error instanceof CuratorApiError ? submitRating.error.code : 'Something went wrong.'}
        </p>
      )}
      {submitRating.isSuccess && <p className="text-sm text-green-700 dark:text-green-400">Rating submitted.</p>}
      <button type="submit" disabled={submitRating.isPending} className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">
        {submitRating.isPending ? 'Submitting…' : 'Submit rating'}
      </button>
    </form>
  )
}

export function CuratorSourcesPage() {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Sources</h1>
      <OnboardSourceForm />
      <RateSourceForm />
      <AssignCategoriesForm />
    </div>
  )
}
