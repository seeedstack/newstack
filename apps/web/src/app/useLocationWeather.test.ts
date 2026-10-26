import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useLocationWeather } from './useLocationWeather'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useLocationWeather', () => {
  it('resolves city/temp/icon once both fetches succeed', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      if (String(url).includes('ipapi.co')) {
        return Promise.resolve(new Response(JSON.stringify({ city: 'Chennai', latitude: 13.08, longitude: 80.27 })))
      }
      return Promise.resolve(
        new Response(JSON.stringify({ current_weather: { temperature: 31.4, weathercode: 1 } }))
      )
    })

    const { result } = renderHook(() => useLocationWeather())
    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current).toEqual({ city: 'Chennai', tempC: 31.4, icon: 'sun' })
  })

  it('resolves to null without throwing when a fetch rejects', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useLocationWeather())
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    expect(result.current).toBeNull()
  })
})
