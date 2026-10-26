import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '../../../components/ui/Button'
import { ApiError } from '../../../lib/apiClient'
import { useConfirmPasswordReset } from '../hooks/useAuthMutations'
import { readTokenFromHash } from '../utils/hashToken'
import { AuthCard } from '../components/AuthCard'

export function ResetConfirmPage() {
  const [newPassword, setNewPassword] = useState('')
  const confirm = useConfirmPasswordReset()
  const token = readTokenFromHash(window.location.hash)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (token === null) return
    confirm.mutate({ token, newPassword })
  }

  if (token === null) return <AuthCard title="Reset password"><p className="text-sm">Missing reset link.</p></AuthCard>

  if (confirm.isSuccess) {
    return (
      <AuthCard title="Password reset">
        <p className="text-sm">
          You can now <Link to="/login" style={{ color: 'var(--color-accent)' }}>log in</Link>.
        </p>
      </AuthCard>
    )
  }

  // §10 idempotency table: a retry after success returns 400 invalid_or_used — the UI
  // reads that as "already reset", not as a fresh error.
  const alreadyUsed = confirm.error instanceof ApiError && confirm.error.code === 'invalid_or_used'

  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div className="field">
          <label htmlFor="newPassword">New password (10-128 characters)</label>
          <input id="newPassword" type="password" required minLength={10} maxLength={128} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input" />
        </div>
        {confirm.isError && (
          <p className="text-sm" style={{ color: 'var(--color-danger-700)' }}>
            {alreadyUsed ? (
              <>
                This link was already used. <Link to="/login" style={{ color: 'var(--color-accent)' }}>Log in</Link>
              </>
            ) : (
              'That link is invalid or expired.'
            )}
          </p>
        )}
        <Button type="submit" variant="primary" block disabled={confirm.isPending}>
          {confirm.isPending ? 'Resetting…' : 'Reset password'}
        </Button>
      </form>
    </AuthCard>
  )
}
