import { useEffect, useState } from 'react'

export type WeatherIcon = 'sun' | 'cloud' | 'rain' | 'snow' | 'storm'

export type LocationWeather = {
  city: string
  tempC: number
  icon: WeatherIcon
}

function iconForWmoCode(code: number): WeatherIcon {
  if (code === 0 || code === 1) return 'sun'
  if (code === 2 || code === 3 || (code >= 45 && code <= 48)) return 'cloud'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'storm'
  return 'cloud'
}

export function useLocationWeather(): LocationWeather | null {
  const [data, setData] = useState<LocationWeather | null>(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        const locRes = await fetch('https://ipapi.co/json/')
        const loc = await locRes.json()
        const { city, latitude, longitude } = loc
        if (typeof city !== 'string' || typeof latitude !== 'number' || typeof longitude !== 'number') return

        const weatherRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`
        )
        const weather = await weatherRes.json()
        const tempC = weather?.current_weather?.temperature
        const code = weather?.current_weather?.weathercode
        if (typeof tempC !== 'number' || typeof code !== 'number') return

        if (!cancelled) setData({ city, tempC, icon: iconForWmoCode(code) })
      } catch {
        // degrade silently — block renders nothing
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  return data
}
