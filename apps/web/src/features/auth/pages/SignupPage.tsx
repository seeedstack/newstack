import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '../../../components/ui/Button'
import { ApiError } from '../../../lib/apiClient'
import { useSignup } from '../hooks/useAuthMutations'
import { AuthCard } from '../components/AuthCard'

export function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const signup = useSignup()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    signup.mutate({ email, password })
  }

  if (signup.isSuccess) {
    return <AuthCard title="Check your email"><p className="text-sm">We sent a link to verify your account.</p></AuthCard>
  }

  return (
    <AuthCard title="Sign up">
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
        </div>
        <div className="field">
          <label htmlFor="password">Password (10-128 characters)</label>
          <input id="password" type="password" required minLength={10} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
        </div>
        {signup.isError && (
          <p className="text-sm" style={{ color: 'var(--color-danger-700)' }}>
            {signup.error instanceof ApiError && signup.error.code === 'common_password'
              ? 'That password is too common — please choose another.'
              : 'Something went wrong. Please try again.'}
          </p>
        )}
        <Button type="submit" variant="primary" block disabled={signup.isPending}>
          {signup.isPending ? 'Signing up…' : 'Sign up'}
        </Button>
        <p className="text-muted text-sm">
          Already have an account? <Link to="/login" style={{ color: 'var(--color-accent)' }}>Log in</Link>
        </p>
      </form>
    </AuthCard>
  )
}
