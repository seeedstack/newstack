import { NavLink } from 'react-router-dom'

import { IconBookmark, IconGrid, IconHome, IconList } from '../ui/icons'

const NAV = [
  { to: '/', label: 'Home', Icon: IconHome },
  { to: '/topics', label: 'Topics', Icon: IconGrid },
  { to: '/sources', label: 'Sources', Icon: IconList },
  { to: '/me/saved', label: 'Saved', Icon: IconBookmark },
]

export function TabBar() {
  return (
    <nav aria-label="Primary" className="tabbar grid grid-cols-4 md:hidden">
      {NAV.map(({ to, label, Icon }) => (
        <NavLink key={to} to={to} end={to === '/'} className="tabbar-link">
          <Icon size={20} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
