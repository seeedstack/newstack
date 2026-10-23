import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Button } from '../../../components/ui/Button'
import { useLogin } from '../hooks/useAuthMutations'
import { AuthCard } from '../components/AuthCard'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const login = useLogin()
  const navigate = useNavigate()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    login.mutate({ email, password }, { onSuccess: () => navigate('/') })
  }

  return (
    <AuthCard title="Log in">
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
        </div>
        {login.isError && (
          // §9: one generic message for both unknown email and wrong password.
          <p className="text-sm" style={{ color: 'var(--color-danger-700)' }}>Invalid email or password.</p>
        )}
        <Button type="submit" variant="primary" block disabled={login.isPending}>
          {login.isPending ? 'Logging in…' : 'Log in'}
        </Button>
        <div className="text-muted flex justify-between text-sm">
          <Link to="/signup" style={{ color: 'var(--color-accent)' }}>Sign up</Link>
          <Link to="/reset" style={{ color: 'var(--color-accent)' }}>Forgot password?</Link>
        </div>
      </form>
    </AuthCard>
  )
}
