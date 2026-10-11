import { useState, type FormEvent } from 'react'

import { useRequestPasswordReset } from '../hooks/useAuthMutations'

export function ResetRequestPage() {
  const [email, setEmail] = useState('')
  const resetRequest = useRequestPasswordReset()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    resetRequest.mutate(email)
  }

  if (resetRequest.isSuccess) {
    return <p className="text-sm">If that email has an account, a reset link is on its way.</p>
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-3">
      <h1 className="text-xl font-semibold">Reset password</h1>
      <input
        type="email"
        required
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
      />
      <button
        type="submit"
        disabled={resetRequest.isPending}
        className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {resetRequest.isPending ? 'Sending…' : 'Send reset link'}
      </button>
    </form>
  )
}
