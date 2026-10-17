import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'

import { Button } from '../components/ui/Button'
import { IconBookmark, IconCloud, IconGrid, IconHome, IconRain, IconSnow, IconStorm, IconSun } from '../components/ui/icons'
import { logout } from '../features/auth'
import { useAuthStore } from '../lib/authStore'
import { useLocationWeather, type WeatherIcon } from './useLocationWeather'

const CONTAINER = 'mx-auto w-full max-w-[1000px] px-4 md:px-8'

const NAV = [
  { to: '/', label: 'Home', Icon: IconHome },
  { to: '/topics', label: 'Topics', Icon: IconGrid },
  { to: '/me/saved', label: 'Saved', Icon: IconBookmark },
]

const WEATHER_ICONS: Record<WeatherIcon, typeof IconSun> = {
  sun: IconSun,
  cloud: IconCloud,
  rain: IconRain,
  snow: IconSnow,
  storm: IconStorm,
}

const today = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date())

function WeatherDate() {
  const weather = useLocationWeather()
  const WeatherIconComp = weather ? WEATHER_ICONS[weather.icon] : null

  return (
    <div className="text-muted flex items-center gap-3 text-sm">
      {weather && WeatherIconComp && (
        <a
          href={`https://www.google.com/search?q=weather+${encodeURIComponent(weather.city)}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5"
        >
          <WeatherIconComp size={16} />
          <span>{Math.round(weather.tempC)}°C {weather.city}</span>
        </a>
      )}
      <span>{today}</span>
    </div>
  )
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="grid h-[22px] w-[22px] grid-rows-3 gap-0.5 p-[3px]" style={{ background: 'var(--color-accent)' }}>
        <span style={{ background: 'var(--color-bg)' }} />
        <span style={{ background: 'var(--color-bg)' }} />
        <span style={{ background: 'var(--color-bg)' }} />
      </span>
      <span className="text-lg" style={{ fontFamily: 'var(--font-heading)', fontWeight: 'var(--font-heading-weight)', letterSpacing: '-0.02em' }}>
        Newstack
      </span>
    </Link>
  )
}

function navLinkClass(isActive: boolean) {
  return [
    'flex items-center gap-3 border-b-4 px-4 py-2.5 text-sm',
    isActive ? 'border-[var(--india-saffron)]' : 'border-transparent',
  ].join(' ')
}

export function RootLayout() {
  const accessToken = useAuthStore((s) => s.accessToken)
  const isSignedIn = accessToken !== null
  const navigate = useNavigate()

  async function onLogout() {
    await logout()
    navigate('/')
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Desktop/tablet top nav */}
      <header className="hidden md:flex md:flex-col" style={{ position: 'sticky', top: 0, background: 'var(--color-bg)', zIndex: 5 }}>
        <div style={{ height: '3px', background: 'var(--india-saffron)' }} />
        <div className={`grid grid-cols-[1fr_auto_1fr] items-center h-[68px] ${CONTAINER}`} style={{ borderBottom: '2px solid var(--color-divider)' }}>
          <WeatherDate />
          <Brand />
          <div className="flex items-center justify-end gap-2">
            {isSignedIn ? (
              <Button variant="ghost" onClick={() => void onLogout()}>Log out</Button>
            ) : (
              <div className="flex gap-2">
                <Link to="/login" className="btn btn-secondary">Log in</Link>
                <Link to="/signup" className="btn btn-primary">Sign up</Link>
              </div>
            )}
          </div>
        </div>
        <div className={`flex items-center gap-6 py-2 ${CONTAINER}`} style={{ borderBottom: '2px solid var(--color-divider)' }}>
          <input type="search" placeholder="Search" className="input max-w-[260px]" />
          <nav className="flex items-center gap-2">
            {NAV.map(({ to, label, Icon }) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => navLinkClass(isActive)}
                style={({ isActive }) => ({ background: isActive ? 'color-mix(in srgb, var(--india-saffron) 12%, var(--color-bg))' : 'transparent', color: isActive ? 'var(--ashoka-chakra-blue)' : 'var(--color-text)' })}>
                <Icon size={18} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      {/* Mobile top bar */}
      <header className="md:hidden" style={{ position: 'sticky', top: 0, background: 'var(--color-bg)', zIndex: 5 }}>
        <div style={{ height: '3px', background: 'var(--india-saffron)' }} />
        <div className={`flex h-14 items-center justify-between ${CONTAINER}`} style={{ borderBottom: '2px solid var(--color-divider)' }}>
          <Brand />
          {isSignedIn ? (
            <Button variant="ghost" onClick={() => void onLogout()}>Log out</Button>
          ) : (
            <Link to="/login" className="btn btn-ghost">Log in</Link>
          )}
        </div>
      </header>

      <main className="flex-1 py-6">
        <div className={CONTAINER}>
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="grid grid-cols-3 md:hidden" style={{ borderTop: '2px solid var(--color-divider)', position: 'sticky', bottom: 0, background: 'var(--color-bg)' }}>
        {NAV.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end={to === '/'}
            className="flex min-h-14 flex-col items-center gap-0.5 border-t-[3px] py-2.5 text-[11px]"
            style={({ isActive }) => ({ borderTopColor: isActive ? 'var(--india-saffron)' : 'transparent', color: isActive ? 'var(--ashoka-chakra-blue)' : 'var(--color-text)' })}>
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
