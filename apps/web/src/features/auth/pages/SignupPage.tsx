import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { ApiError } from '../../../lib/apiClient'
import { useSignup } from '../hooks/useAuthMutations'

export function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const signup = useSignup()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    signup.mutate({ email, password })
  }

  if (signup.isSuccess) {
    return <p className="text-sm">Check your email to verify your account.</p>
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-3">
      <h1 className="text-xl font-semibold">Sign up</h1>
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
        minLength={10}
        maxLength={128}
        placeholder="Password (10-128 characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
      />
      {signup.isError && (
        <p className="text-sm text-red-700 dark:text-red-400">
          {signup.error instanceof ApiError && signup.error.code === 'common_password'
            ? 'That password is too common — please choose another.'
            : 'Something went wrong. Please try again.'}
        </p>
      )}
      <button
        type="submit"
        disabled={signup.isPending}
        className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {signup.isPending ? 'Signing up…' : 'Sign up'}
      </button>
      <p className="text-sm text-neutral-500">
        Already have an account? <Link to="/login" className="underline">Log in</Link>
      </p>
    </form>
  )
}
