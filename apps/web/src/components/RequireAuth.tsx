import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { useAuthStore } from '../lib/authStore'
import { LoadingState } from './QueryStates'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { accessToken, authReady } = useAuthStore()

  if (!authReady) return <LoadingState />
  if (accessToken === null) return <Navigate to="/login" replace />
  return children
}
