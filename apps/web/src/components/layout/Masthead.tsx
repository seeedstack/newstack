import { Link } from 'react-router-dom'

import { IconCloud, IconRain, IconSnow, IconStorm, IconSun } from '../ui/icons'
import { useEdition, useLocationWeather, type WeatherIcon } from '../../app/useLocationWeather'

const WEATHER_ICONS: Record<WeatherIcon, typeof IconSun> = {
  sun: IconSun,
  cloud: IconCloud,
  rain: IconRain,
  snow: IconSnow,
  storm: IconStorm,
}

const dateFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

type MastheadProps = {
  variant: 'home' | 'inner'
  isSignedIn: boolean
  onLogout: () => void
}

export function Masthead({ variant, isSignedIn, onLogout }: MastheadProps) {
  const weather = useLocationWeather()
  const edition = useEdition(weather?.city)
  const WeatherIconComp = weather ? WEATHER_ICONS[weather.icon] : null

  return (
    <header id="top">
      <div className="masthead-dateline">
        <span className="flex flex-wrap items-center gap-3">
          <span>{dateFormatter.format(new Date())}</span>
          {weather && WeatherIconComp && (
            <a
              href={`https://www.google.com/search?q=weather+${encodeURIComponent(weather.city)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 normal-case"
              aria-label={`Weather in ${weather.city}, ${Math.round(weather.tempC)} degrees Celsius`}
            >
              <WeatherIconComp size={14} aria-hidden />
              <span>{Math.round(weather.tempC)}°C {weather.city}</span>
            </a>
          )}
        </span>
        <span className="hidden items-center gap-4 md:flex">
          <span>Edition No. {edition.number} · {edition.city}</span>
          {isSignedIn ? (
            <button type="button" onClick={onLogout} className="normal-case" style={{ background: 'none', border: 0, cursor: 'pointer', color: 'inherit', font: 'inherit', letterSpacing: 'inherit' }}>
              Log out
            </button>
          ) : (
            <span className="flex gap-3">
              <Link to="/login" className="normal-case">Log in</Link>
              <Link to="/signup" className="normal-case">Sign up</Link>
            </span>
          )}
        </span>
      </div>

      {variant === 'home' && (
        <div className="masthead-kicker" style={{ paddingTop: 'clamp(24px, 4vw, 44px)' }}>
          <span className="accent-rule" aria-hidden />
          <span>The Daily Briefing · India &amp; the World</span>
          <span className="accent-rule green" aria-hidden />
        </div>
      )}

      <Link
        to="/"
        className={`masthead-wordmark ${variant === 'inner' ? 'inner' : ''}`}
        style={{ paddingTop: variant === 'home' ? undefined : 'clamp(12px, 2vw, 20px)' }}
      >
        NEWSTACK
      </Link>

      {variant === 'home' && <p className="masthead-tagline">Look beyond the headline.</p>}

      <div className="rule-double" aria-hidden>
        <span />
        <span />
      </div>
    </header>
  )
}
