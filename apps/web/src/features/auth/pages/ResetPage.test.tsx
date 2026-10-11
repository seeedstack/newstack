import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { renderWithProviders } from '../../../test/renderWithProviders'
import { ResetPage } from './ResetPage'

afterEach(() => {
  window.location.hash = ''
})

describe('ResetPage', () => {
  it('shows the request form when the URL has no token fragment', () => {
    renderWithProviders(<ResetPage />)
    expect(screen.getByRole('heading', { name: 'Reset password' })).toBeInTheDocument()
  })

  it('shows the confirm form when the URL carries a #t= token', () => {
    window.location.hash = '#t=sometoken'
    renderWithProviders(<ResetPage />)
    expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
  })
})
