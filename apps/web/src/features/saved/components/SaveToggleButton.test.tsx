import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '../../../lib/authStore'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { SaveToggleButton } from './SaveToggleButton'

afterEach(() => {
  useAuthStore.setState({ accessToken: null, user: null, authReady: true })
  vi.restoreAllMocks()
})

describe('SaveToggleButton', () => {
  it('prompts sign-in instead of calling the API when logged out', () => {
    vi.spyOn(globalThis, "fetch")
    renderWithProviders(<SaveToggleButton kind="stories" id="story-1" />)
    expect(screen.getByText('Sign in to save')).toBeInTheDocument()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('shows the active label once the item is in the saved list', async () => {
    useAuthStore.setState({ accessToken: 'tok', user: { id: 'u1' }, authReady: true })
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ items: ['story-1'] }), { status: 200, headers: { 'content-type': 'application/json' } })
    )
    renderWithProviders(<SaveToggleButton kind="stories" id="story-1" />)
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })
})
