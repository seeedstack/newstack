import { NavLink, Outlet } from 'react-router-dom'

const TABS = [
  { to: '/me/saved/stories', label: 'Stories' },
  { to: '/me/saved/sources', label: 'Sources' },
  { to: '/me/saved/topics', label: 'Topics' },
]

export function SavedLayout() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Saved</h1>
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
  )
}
