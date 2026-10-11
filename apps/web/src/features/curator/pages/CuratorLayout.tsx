import { NavLink, Outlet } from 'react-router-dom'

import { CuratorKeyGate } from '../components/CuratorKeyGate'

const TABS = [
  { to: '/curator/sources', label: 'Sources' },
  { to: '/curator/topics', label: 'Topics' },
  { to: '/curator/moderation', label: 'Moderation' },
  { to: '/curator/blindspot', label: 'Blindspot' },
]

export function CuratorLayout() {
  return (
    <CuratorKeyGate>
      <div className="flex flex-col gap-4">
        <nav className="flex gap-4 border-b border-neutral-200 dark:border-neutral-800">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `-mb-px border-b-2 px-1 py-2 text-sm ${
                  isActive ? 'border-neutral-900 font-medium dark:border-neutral-100' : 'border-transparent text-neutral-500'
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
        <Outlet />
      </div>
    </CuratorKeyGate>
  )
}
