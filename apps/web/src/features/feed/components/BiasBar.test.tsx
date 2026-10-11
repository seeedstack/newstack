import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { BiasBar } from './BiasBar'
import type { BiasBar as BiasBarData } from '../types'

function seg(count: number, lowConfidenceCount = 0) {
  return { count, lowConfidenceCount }
}

describe('BiasBar', () => {
  it('shows the pinned "no rated sources" copy when nothing is rated', () => {
    const bar: BiasBarData = {
      left: seg(0),
      centerLeft: seg(0),
      center: seg(0),
      centerRight: seg(0),
      right: seg(0),
      notRated: seg(3),
    }
    render(<BiasBar bar={bar} />)
    expect(screen.getByText('No rated sources yet')).toBeInTheDocument()
  })

  it('never phrases the summary as a single bias label or a percentage', () => {
    const bar: BiasBarData = {
      left: seg(6),
      centerLeft: seg(3),
      center: seg(2),
      centerRight: seg(0),
      right: seg(1),
      notRated: seg(2),
    }
    render(<BiasBar bar={bar} />)
    const el = screen.getByRole('img')
    const label = el.getAttribute('aria-label') ?? ''
    expect(label).toContain('12 rated sources covered this story')
    expect(label).toContain('6 left-leaning')
    expect(label).not.toMatch(/%/)
  })

  it('renders one colored segment per non-zero bias category', () => {
    const bar: BiasBarData = {
      left: seg(1),
      centerLeft: seg(0),
      center: seg(1),
      centerRight: seg(0),
      right: seg(1),
      notRated: seg(0),
    }
    const { container } = render(<BiasBar bar={bar} />)
    const segments = container.querySelectorAll('[role="img"] > div')
    expect(segments).toHaveLength(3)
  })
})
