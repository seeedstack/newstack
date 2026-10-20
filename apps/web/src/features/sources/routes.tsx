import type { RouteObject } from 'react-router-dom'

import { SourceDirectoryPage } from './pages/SourceDirectoryPage'
import { SourceProfilePage } from './pages/SourceProfilePage'

export const sourceRoutes: RouteObject[] = [
  { path: '/sources', element: <SourceDirectoryPage /> },
  { path: '/sources/:id', element: <SourceProfilePage /> },
]
