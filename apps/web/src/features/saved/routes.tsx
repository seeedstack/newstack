import { Navigate, type RouteObject } from 'react-router-dom'

import { RequireAuth } from '../../components/RequireAuth'
import { SavedLayout } from './pages/SavedLayout'
import { SavedSourcesTab } from './pages/SavedSourcesTab'
import { SavedStoriesTab } from './pages/SavedStoriesTab'
import { SavedTopicsTab } from './pages/SavedTopicsTab'

export const savedRoutes: RouteObject[] = [
  {
    path: '/me/saved',
    element: (
      <RequireAuth>
        <SavedLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="stories" replace /> },
      { path: 'stories', element: <SavedStoriesTab /> },
      { path: 'sources', element: <SavedSourcesTab /> },
      { path: 'topics', element: <SavedTopicsTab /> },
    ],
  },
]
