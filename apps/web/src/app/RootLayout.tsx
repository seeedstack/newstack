import { useState, type FormEvent } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

import { Footer } from '../components/layout/Footer'
import { Masthead } from '../components/layout/Masthead'
import { SectionNav } from '../components/layout/SectionNav'
import { TabBar } from '../components/layout/TabBar'
import { logout } from '../features/auth'
import { useAuthStore } from '../lib/authStore'

const CONTAINER = 'mx-auto w-full px-4'

export function RootLayout() {
  const accessToken = useAuthStore((s) => s.accessToken)
  const isSignedIn = accessToken !== null
  const navigate = useNavigate()
  const location = useLocation()
  const [search, setSearch] = useState('')

  async function onLogout() {
    await logout()
    navigate('/')
  }

  function onSearchSubmit(e: FormEvent) {
    e.preventDefault()
    navigate(`/sources?q=${encodeURIComponent(search)}`)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="skip-link">Skip to content</a>

      <div className={CONTAINER} style={{ maxWidth: 1360, padding: '0 clamp(16px, 4vw, 48px)' }}>
        <Masthead variant={location.pathname === '/' ? 'home' : 'inner'} isSignedIn={isSignedIn} onLogout={() => void onLogout()} />
      </div>

      <SectionNav isSignedIn={isSignedIn} onLogout={() => void onLogout()} search={search} onSearchChange={setSearch} onSearchSubmit={onSearchSubmit} />

      <main id="main" tabIndex={-1} className="flex-1 py-6">
        <div className={CONTAINER} style={{ maxWidth: 1360, padding: '0 clamp(16px, 4vw, 48px)' }}>
          <Outlet />
        </div>
      </main>

      <TabBar />
      <Footer />
    </div>
  )
}
