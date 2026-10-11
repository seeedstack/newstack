import type { RouteObject } from 'react-router-dom'

import { HomeFeedPage } from './pages/HomeFeedPage'
import { StoryDetailPage } from './pages/StoryDetailPage'

export const feedRoutes: RouteObject[] = [
  { path: '/', element: <HomeFeedPage /> },
  { path: '/stories/:id', element: <StoryDetailPage /> },
]
