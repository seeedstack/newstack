import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'

import { useVerifyEmail } from '../hooks/useAuthMutations'
import { readTokenFromHash } from '../utils/hashToken'

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

  if (token === null) return <p className="text-sm">Missing verification link.</p>
  if (verify.isPending || verify.isIdle) return <p className="text-sm">Verifying…</p>
  if (verify.isSuccess) {
    return (
      <p className="text-sm">
        Email verified. <Link to="/login" className="underline">Log in</Link>
      </p>
    )
  }
  return <p className="text-sm text-red-700 dark:text-red-400">That link is invalid or expired.</p>
}
