import { NavLink, Outlet } from 'react-router-dom'

import { SectionEyebrow } from '../../../components/ui/SectionEyebrow'

const TABS = [
  { to: '/me/saved/stories', label: 'Stories' },
  { to: '/me/saved/sources', label: 'Sources' },
  { to: '/me/saved/topics', label: 'Topics' },
]

export function SavedLayout() {
  return (
    <div className="flex flex-col gap-4">
      <SectionEyebrow>Your Library</SectionEyebrow>
      <h1>Saved</h1>
      <div className="seg self-start">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className="seg-opt"
            style={({ isActive }) => ({ background: isActive ? 'var(--color-accent)' : 'transparent', color: isActive ? 'var(--color-bg)' : 'inherit' })}
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  )
}
