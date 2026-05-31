import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchTodayEvents, fetchWeather } from './api'
import { useToken } from './useToken'
import { addDays, startOfDay } from './dates'
import type { CalendarEvent, Weather } from './types'
import { WeatherPanel } from './components/WeatherPanel'
import { Agenda } from './components/Agenda'

const EVENTS_REFRESH_MS = 5 * 60 * 1000 // today's events
const WEATHER_REFRESH_MS = 30 * 60 * 1000 // weather (Open-Meteo updates ~hourly)
const CLOCK_TICK_MS = 30 * 1000 // clock display
const RELOAD_HOUR = 4 // once-a-day kiosk reload (local hour)

export default function App() {
  const { token, ready } = useToken()
  const [now, setNow] = useState<Date>(() => new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [weather, setWeather] = useState<Weather | null>(null)
  const [error, setError] = useState('')
  const [weatherNote, setWeatherNote] = useState('')

  const eventsCtrl = useRef<AbortController | null>(null)
  const weatherCtrl = useRef<AbortController | null>(null)

  const loadEvents = useCallback(async () => {
    eventsCtrl.current?.abort()
    const ctrl = new AbortController()
    eventsCtrl.current = ctrl
    try {
      const day = startOfDay(new Date())
      const data = await fetchTodayEvents(token, day, addDays(day, 1), ctrl.signal)
      if (ctrl.signal.aborted) return
      setEvents(data.events)
      setError('')
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setError((e as Error).message || 'Failed to load events.')
    }
  }, [token])

  const loadWeather = useCallback(async () => {
    weatherCtrl.current?.abort()
    const ctrl = new AbortController()
    weatherCtrl.current = ctrl
    try {
      const data = await fetchWeather(token, ctrl.signal)
      if (ctrl.signal.aborted) return
      setWeather(data)
      setWeatherNote('')
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      // Weather is non-critical: keep the dashboard usable, show a subtle note.
      setWeather(null)
      setWeatherNote((e as Error).message || 'Weather unavailable.')
    }
  }, [token])

  // Initial load once the token is resolved.
  useEffect(() => {
    if (!ready) return
    loadEvents()
    loadWeather()
    return () => {
      eventsCtrl.current?.abort()
      weatherCtrl.current?.abort()
    }
  }, [ready, loadEvents, loadWeather])

  // Periodic refresh.
  useEffect(() => {
    const e = setInterval(() => loadEvents(), EVENTS_REFRESH_MS)
    const w = setInterval(() => loadWeather(), WEATHER_REFRESH_MS)
    return () => {
      clearInterval(e)
      clearInterval(w)
    }
  }, [loadEvents, loadWeather])

  // Clock tick + refresh when the screen wakes / app returns to foreground.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), CLOCK_TICK_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setNow(new Date())
        loadEvents()
        loadWeather()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [loadEvents, loadWeather])

  // Once-a-day reload (at RELOAD_HOUR, or the next wake after it) to pick up deploys.
  useEffect(() => {
    const next = new Date()
    next.setHours(RELOAD_HOUR, 0, 0, 0)
    if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1)
    const target = next.getTime()
    const id = setInterval(() => {
      if (Date.now() >= target) window.location.reload()
    }, 60 * 1000)
    return () => clearInterval(id)
  }, [])

  const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const date = now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="dash">
      <header className="dash-head">
        <div className="clock">{time}</div>
        <div className="date">{date}</div>
      </header>

      {error ? (
        <div className="banner error">
          {error}
          {!token ? ' — open via the secret link (…/dashboard/?token=YOUR_TOKEN).' : ''}
        </div>
      ) : null}

      {weather ? (
        <WeatherPanel weather={weather} />
      ) : weatherNote ? (
        <div className="weather-note">{weatherNote}</div>
      ) : null}

      <Agenda events={events} />
    </div>
  )
}
