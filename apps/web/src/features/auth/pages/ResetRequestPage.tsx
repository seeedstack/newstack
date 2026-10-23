import { useState, type FormEvent } from 'react'

import { Button } from '../../../components/ui/Button'
import { useRequestPasswordReset } from '../hooks/useAuthMutations'
import { AuthCard } from '../components/AuthCard'

export function ResetRequestPage() {
  const [email, setEmail] = useState('')
  const resetRequest = useRequestPasswordReset()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    resetRequest.mutate(email)
  }

  if (resetRequest.isSuccess) {
    return <AuthCard title="Check your email"><p className="text-sm">If that email has an account, a reset link is on its way.</p></AuthCard>
  }

  return (
    <AuthCard title="Reset password">
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
        </div>
        <Button type="submit" variant="primary" block disabled={resetRequest.isPending}>
          {resetRequest.isPending ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
    </AuthCard>
  )
}
