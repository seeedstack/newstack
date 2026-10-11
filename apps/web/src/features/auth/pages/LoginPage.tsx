import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useLogin } from '../hooks/useAuthMutations'

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
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-3">
      <h1 className="text-xl font-semibold">Log in</h1>
      <input
        type="email"
        required
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
      />
      <input
        type="password"
        required
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
      />
      {login.isError && (
        // §9: one generic message for both unknown email and wrong password.
        <p className="text-sm text-red-700 dark:text-red-400">Invalid email or password.</p>
      )}
      <button
        type="submit"
        disabled={login.isPending}
        className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {login.isPending ? 'Logging in…' : 'Log in'}
      </button>
      <div className="flex justify-between text-sm text-neutral-500">
        <Link to="/signup" className="underline">Sign up</Link>
        <Link to="/reset" className="underline">Forgot password?</Link>
      </div>
    </form>
  )
}
