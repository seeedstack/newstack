import { createBrowserRouter } from 'react-router-dom'

import { authRoutes } from '../features/auth'
import { billingRoutes } from '../features/billing'
import { curatorRoutes } from '../features/curator'
import { feedRoutes } from '../features/feed'
import { savedRoutes } from '../features/saved'
import { sourceRoutes } from '../features/sources'
import { topicRoutes } from '../features/topics'
import { RootLayout } from './RootLayout'

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [...feedRoutes, ...authRoutes, ...topicRoutes, ...savedRoutes, ...sourceRoutes, ...curatorRoutes, ...billingRoutes],
  },
])
