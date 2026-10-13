import type { RouteObject } from 'react-router-dom'

import { SourceProfilePage } from './pages/SourceProfilePage'

export const sourceRoutes: RouteObject[] = [{ path: '/sources/:id', element: <SourceProfilePage /> }]
