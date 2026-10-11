import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { ApiError } from '../../../lib/apiClient'
import { useConfirmPasswordReset } from '../hooks/useAuthMutations'
import { readTokenFromHash } from '../utils/hashToken'

export function ResetConfirmPage() {
  const [newPassword, setNewPassword] = useState('')
  const confirm = useConfirmPasswordReset()
  const token = readTokenFromHash(window.location.hash)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (token === null) return
    confirm.mutate({ token, newPassword })
  }

  if (token === null) return <p className="text-sm">Missing reset link.</p>

  if (confirm.isSuccess) {
    return (
      <p className="text-sm">
        Password reset. <Link to="/login" className="underline">Log in</Link>
      </p>
    )
  }

  // §10 idempotency table: a retry after success returns 400 invalid_or_used — the UI
  // reads that as "already reset", not as a fresh error.
  const alreadyUsed = confirm.error instanceof ApiError && confirm.error.code === 'invalid_or_used'

  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-3">
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      <input
        type="password"
        required
        minLength={10}
        maxLength={128}
        placeholder="New password (10-128 characters)"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
      />
      {confirm.isError && (
        <p className="text-sm text-red-700 dark:text-red-400">
          {alreadyUsed ? (
            <>
              This link was already used. <Link to="/login" className="underline">Log in</Link>
            </>
          ) : (
            'That link is invalid or expired.'
          )}
        </p>
      )}
      <button
        type="submit"
        disabled={confirm.isPending}
        className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {confirm.isPending ? 'Resetting…' : 'Reset password'}
      </button>
    </form>
  )
}
