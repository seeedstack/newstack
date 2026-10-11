import { Navigate, type RouteObject } from 'react-router-dom'

import { CuratorBlindspotPage } from './pages/CuratorBlindspotPage'
import { CuratorLayout } from './pages/CuratorLayout'
import { CuratorModerationPage } from './pages/CuratorModerationPage'
import { CuratorSourcesPage } from './pages/CuratorSourcesPage'
import { CuratorTopicsPage } from './pages/CuratorTopicsPage'

export const curatorRoutes: RouteObject[] = [
  {
    path: '/curator',
    element: <CuratorLayout />,
    children: [
      { index: true, element: <Navigate to="sources" replace /> },
      { path: 'sources', element: <CuratorSourcesPage /> },
      { path: 'topics', element: <CuratorTopicsPage /> },
      { path: 'moderation', element: <CuratorModerationPage /> },
      { path: 'blindspot', element: <CuratorBlindspotPage /> },
    ],
  },
]
