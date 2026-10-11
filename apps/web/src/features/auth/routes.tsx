import type { RouteObject } from 'react-router-dom'

import { LoginPage } from './pages/LoginPage'
import { ResetPage } from './pages/ResetPage'
import { SignupPage } from './pages/SignupPage'
import { VerifyPage } from './pages/VerifyPage'

export const authRoutes: RouteObject[] = [
  { path: '/signup', element: <SignupPage /> },
  { path: '/verify', element: <VerifyPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/reset', element: <ResetPage /> },
]
