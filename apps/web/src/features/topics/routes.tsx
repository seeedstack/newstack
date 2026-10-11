import type { RouteObject } from 'react-router-dom'

import { TopicFeedPage } from './pages/TopicFeedPage'
import { TopicListPage } from './pages/TopicListPage'

export const topicRoutes: RouteObject[] = [
  { path: '/topics', element: <TopicListPage /> },
  { path: '/topics/:id', element: <TopicFeedPage /> },
]
