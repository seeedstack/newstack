import { createBrowserRouter } from 'react-router-dom'

import { authRoutes } from '../features/auth'
import { curatorRoutes } from '../features/curator'
import { feedRoutes } from '../features/feed'
import { savedRoutes } from '../features/saved'
import { topicRoutes } from '../features/topics'
import { RootLayout } from './RootLayout'

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [...feedRoutes, ...authRoutes, ...topicRoutes, ...savedRoutes, ...curatorRoutes],
  },
])
