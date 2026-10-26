import { Link } from 'react-router-dom'

import { useEdition, useLocationWeather } from '../../app/useLocationWeather'

export function Footer() {
  const weather = useLocationWeather()
  const edition = useEdition(weather?.city)
  const year = new Date().getFullYear()

  return (
    <footer className="site-footer">
      <div style={{ maxWidth: 1360, margin: '0 auto', padding: 'clamp(48px, 6vw, 80px) clamp(16px, 4vw, 48px) 28px', display: 'flex', flexDirection: 'column', gap: 40 }}>
        <div className="site-footer-top">
          <div>
            <p className="site-footer-wordmark">NEWSTACK</p>
            <p className="site-footer-tagline">Look beyond the headline.</p>
          </div>
          <a href="#top" className="site-footer-top-link">Back to top ↑</a>
        </div>

        <div className="site-footer-columns">
          <div>
            <p className="site-footer-heading">Sections</p>
            <Link to="/topics">Topics</Link>
            <Link to="/sources">Sources</Link>
            <Link to="/me/saved">Saved</Link>
          </div>
          <div>
            <p className="site-footer-heading">Newstack</p>
            <span className="muted">About (page in preparation)</span>
            <span className="muted">Our Method (page in preparation)</span>
            <Link to="/sources">Source Directory</Link>
          </div>
          <div>
            <p className="site-footer-heading">Standards</p>
            <span className="muted">Editorial Principles (page in preparation)</span>
            <span className="muted">Privacy (page in preparation)</span>
            <span className="muted">Contact (page in preparation)</span>
          </div>
        </div>

        <div className="rule-double on-dark" aria-hidden>
          <span />
          <span />
        </div>

        <div className="site-footer-bottom">
          <span>© {year} Newstack. Independent news coverage analysis.</span>
          <span className="flex items-center gap-2">
            Edition No. {edition.number} · {edition.city}
            <span className="site-footer-swatches" aria-hidden>
              <span />
              <span />
              <span />
            </span>
          </span>
        </div>
      </div>
    </footer>
  )
}
