import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'

import { useVerifyEmail } from '../hooks/useAuthMutations'
import { readTokenFromHash } from '../utils/hashToken'
import { AuthCard } from '../components/AuthCard'

export function VerifyPage() {
  const verify = useVerifyEmail()
  const triggered = useRef(false)

  useEffect(() => {
    if (triggered.current) return
    triggered.current = true
    const token = readTokenFromHash(window.location.hash)
    if (token === null) return
    verify.mutate(token)
    // Referrer-Policy: no-referrer is set server-side on this page; the token never
    // needs to leave the fragment again once consumed.
  }, [verify])

  const token = readTokenFromHash(window.location.hash)

  if (token === null) return <AuthCard title="Verify email"><p className="text-sm">Missing verification link.</p></AuthCard>
  if (verify.isPending || verify.isIdle) return <AuthCard title="Verify email"><p className="text-sm">Verifying…</p></AuthCard>
  if (verify.isSuccess) {
    return (
      <AuthCard title="Email verified">
        <p className="text-sm">
          <Link to="/login" style={{ color: 'var(--color-accent)' }}>Log in</Link>
        </p>
      </AuthCard>
    )
  }
  return <AuthCard title="Verify email"><p className="text-sm" style={{ color: 'var(--color-danger-700)' }}>That link is invalid or expired.</p></AuthCard>
}
