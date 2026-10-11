import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App.tsx'
import { silentLogin } from './lib/apiClient'

// Fire-and-forget: restores a session from the httpOnly refresh cookie, if any. The auth
// store's `authReady` flag flips once this settles (either way), so route guards and the
// nav bar don't flash a logged-out state while it's in flight.
void silentLogin()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
