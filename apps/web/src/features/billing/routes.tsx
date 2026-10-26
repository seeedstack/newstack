import type { RouteObject } from 'react-router-dom'

import { RequireAuth } from '../../components/RequireAuth'
import { AccountBillingPage } from './pages/AccountBillingPage'
import { SubscribePage } from './pages/SubscribePage'

export const billingRoutes: RouteObject[] = [
  { path: '/subscribe', element: <SubscribePage /> },
  {
    path: '/account/billing',
    element: (
      <RequireAuth>
        <AccountBillingPage />
      </RequireAuth>
    ),
  },
]
