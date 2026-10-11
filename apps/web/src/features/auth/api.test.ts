import { afterEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '../../lib/authStore'
import { logout } from './api'

afterEach(() => {
  useAuthStore.setState({ accessToken: null, user: null, authReady: true })
  vi.restoreAllMocks()
})

describe('logout', () => {
  it('clears the local session after a successful server-side revoke', async () => {
    useAuthStore.setState({ accessToken: 'tok', user: { id: 'u1' }, authReady: true })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))

    await logout()

    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('still clears the local session even if the network call fails', async () => {
    useAuthStore.setState({ accessToken: 'tok', user: { id: 'u1' }, authReady: true })
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))

    await logout()

    expect(useAuthStore.getState().accessToken).toBeNull()
  })
})
