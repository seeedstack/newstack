import { Link, Outlet, useNavigate } from 'react-router-dom'

import { logout } from '../features/auth'
import { useAuthStore } from '../lib/authStore'

export function RootLayout() {
  const accessToken = useAuthStore((s) => s.accessToken)
  const isSignedIn = accessToken !== null
  const navigate = useNavigate()

  async function onLogout() {
    await logout()
    navigate('/')
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between">
        <Link to="/" className="text-lg font-semibold">
          Newstack
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/topics" className="hover:underline">Topics</Link>
          {isSignedIn ? (
            <>
              <Link to="/me/saved" className="hover:underline">Saved</Link>
              <button type="button" onClick={() => void onLogout()} className="hover:underline">
                Log out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="hover:underline">Log in</Link>
              <Link to="/signup" className="hover:underline">Sign up</Link>
            </>
          )}
        </nav>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
