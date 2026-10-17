import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BiasBarLegend } from './BiasBarLegend'
import type { SourceDistribution } from '../types'

const { useSourceDistribution } = vi.hoisted(() => ({ useSourceDistribution: vi.fn() }))
vi.mock('../hooks/useSourceDistribution', () => ({ useSourceDistribution }))

function mockData(data: SourceDistribution | undefined) {
  useSourceDistribution.mockReturnValue({ data })
}

describe('BiasBarLegend', () => {
  it('renders nothing while loading or when nothing is rated', () => {
    mockData(undefined)
    const { container: loading } = render(<BiasBarLegend />)
    expect(loading).toBeEmptyDOMElement()

    mockData({ left: 0, centerLeft: 0, center: 0, centerRight: 0, right: 0, notRated: 5 })
    const { container: empty } = render(<BiasBarLegend />)
    expect(empty).toBeEmptyDOMElement()
  })

  it('never phrases the summary as a single bias label or a percentage', () => {
    mockData({ left: 6, centerLeft: 3, center: 2, centerRight: 0, right: 1, notRated: 2 })
    render(<BiasBarLegend />)
    const el = screen.getByRole('img')
    const label = el.getAttribute('aria-label') ?? ''
    expect(label).toContain('12 rated sources we track')
    expect(label).toContain('6 left')
    expect(label).not.toMatch(/%/)
  })

  it('renders one colored segment per non-zero bias category', () => {
    mockData({ left: 1, centerLeft: 0, center: 1, centerRight: 0, right: 1, notRated: 0 })
    const { container } = render(<BiasBarLegend />)
    const segments = container.querySelectorAll('[role="img"] > div')
    expect(segments).toHaveLength(3)
  })
})
