import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, NavLink } from 'react-router-dom'

import { IconList } from '../ui/icons'

const NAV = [
  { to: '/', label: 'Home' },
  { to: '/topics', label: 'Topics' },
  { to: '/sources', label: 'Sources' },
  { to: '/me/saved', label: 'Saved' },
]

type SectionNavProps = {
  isSignedIn: boolean
  onLogout: () => void
  search: string
  onSearchChange: (value: string) => void
  onSearchSubmit: (e: FormEvent) => void
}

export function SectionNav({ isSignedIn, onLogout, search, onSearchChange, onSearchSubmit }: SectionNavProps) {
  const markRef = useRef<HTMLAnchorElement>(null)
  const [markVisible, setMarkVisible] = useState(false)

  useEffect(() => {
    const masthead = document.getElementById('top')
    if (!masthead) return
    const observer = new IntersectionObserver(([entry]) => setMarkVisible(!entry.isIntersecting), { threshold: 0 })
    observer.observe(masthead)
    return () => observer.disconnect()
  }, [])

  return (
    <nav aria-label="Sections" className="section-nav">
      <div className="section-nav-inner" style={{ maxWidth: 1360, margin: '0 auto', padding: '0 clamp(16px, 4vw, 48px)' }}>
        <a ref={markRef} href="#top" className="section-nav-mark" style={{ visibility: markVisible ? 'visible' : 'hidden' }}>
          N
        </a>
        <div className="section-nav-links">
          {NAV.map(({ to, label }) => (
            <NavLink key={to} to={to} end={to === '/'} className="section-nav-link">
              {label}
            </NavLink>
          ))}
        </div>
        <div className="ml-auto hidden items-center gap-3 md:flex">
          <form role="search" onSubmit={onSearchSubmit}>
            <input
              type="search"
              placeholder="Search sources"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="input"
              style={{ maxWidth: 220 }}
            />
          </form>
        </div>
        <div className="ml-auto flex items-center gap-3 md:hidden">
          <Link to="/sources" aria-label="Search sources" className="btn-icon btn-secondary btn" style={{ display: 'inline-flex' }}>
            <IconList size={18} />
          </Link>
          {isSignedIn ? (
            <button type="button" onClick={onLogout} className="btn btn-ghost">Log out</button>
          ) : (
            <Link to="/login" className="btn btn-ghost">Log in</Link>
          )}
        </div>
      </div>
    </nav>
  )
}
