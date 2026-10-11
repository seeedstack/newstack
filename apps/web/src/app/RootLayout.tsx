import { Link, Outlet } from 'react-router-dom'

import { useAuthStore } from '../lib/authStore'

export function RootLayout() {
  const { accessToken, clearSession } = useAuthStore()
  const isSignedIn = accessToken !== null

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
              {/* Known gap, not papered over: there is no POST /auth/logout in apps/api, and
                  the refresh cookie's Path=/auth/refresh (ARCHITECTURE §9, pinned) means a
                  logout route couldn't read it to revoke the family even if added without
                  also changing that path — a decision for whoever owns that pin, not this
                  frontend pass. This clears the local access token only; the refresh session
                  remains valid server-side until it expires (30 days) or is otherwise revoked. */}
              <button type="button" onClick={() => clearSession()} className="hover:underline">
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
