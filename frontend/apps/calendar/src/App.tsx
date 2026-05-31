import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchEvents } from './api'
import { useToken } from './useToken'
import { bucketByDay } from './events'
import { addDays, monthGridRange, startOfDay } from './dates'
import type { CalendarEvent, View } from './types'
import { Header } from './components/Header'
import { MonthGrid } from './components/MonthGrid'
import { AgendaList } from './components/AgendaList'
import { WeekView } from './components/WeekView'

const DATA_REFRESH_MS = 5 * 60 * 1000 // re-fetch events every 5 minutes
const CLOCK_TICK_MS = 30 * 1000 // update the clock / "today" highlight

// The fetch window for the current view + anchor date.
function rangeFor(view: View, anchor: Date): { start: Date; end: Date } {
  if (view === 'month') {
    const { gridStart, gridEnd } = monthGridRange(anchor)
    return { start: gridStart, end: gridEnd }
  }
  if (view === 'week') {
    const start = addDays(startOfDay(anchor), -anchor.getDay())
    return { start, end: addDays(start, 7) }
  }
  const start = startOfDay(anchor) // agenda: from today, 30 days out
  return { start, end: addDays(start, 30) }
}

function shift(view: View, anchor: Date, dir: number): Date {
  if (view === 'month') return new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1)
  if (view === 'week') return addDays(anchor, 7 * dir)
  return addDays(anchor, 30 * dir)
}

export default function App() {
  const { token, ready } = useToken()
  const [view, setView] = useState<View>('month')
  const [anchor, setAnchor] = useState<Date>(() => new Date())
  const [now, setNow] = useState<Date>(() => new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const { start, end } = useMemo(() => rangeFor(view, anchor), [view, anchor])

  // Track the in-flight request so a newer load always supersedes an older one
  // (e.g. a periodic/visibility refresh overlapping a view or month change) —
  // only the latest fetch may write state.
  const inFlight = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    inFlight.current?.abort()
    const ctrl = new AbortController()
    inFlight.current = ctrl
    setLoading(true)
    try {
      const data = await fetchEvents(token, start, end, ctrl.signal)
      if (ctrl.signal.aborted) return
      setEvents(data.events)
      setError('')
      setLastUpdated(new Date())
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setError((e as Error).message || 'Failed to load events.')
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [token, start, end])

  // Fetch whenever the range or token changes (once the token is resolved).
  useEffect(() => {
    if (!ready) return
    load()
    return () => inFlight.current?.abort()
  }, [load, ready])

  // Periodic background refresh of event data.
  useEffect(() => {
    const id = setInterval(() => load(), DATA_REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  // Tick the clock / "today" highlight, and refresh when the tab regains focus.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), CLOCK_TICK_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setNow(new Date())
        load()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  const byDay = useMemo(() => bucketByDay(events), [events])

  return (
    <div className="app">
      <Header
        view={view}
        onView={setView}
        anchor={anchor}
        now={now}
        loading={loading}
        lastUpdated={lastUpdated}
        onPrev={() => setAnchor((a) => shift(view, a, -1))}
        onNext={() => setAnchor((a) => shift(view, a, 1))}
        onToday={() => setAnchor(new Date())}
      />
      {error ? (
        <div className="banner error">
          {error}
          {!token ? ' — open the calendar via its secret link (…/calendar/?token=YOUR_TOKEN).' : ''}
        </div>
      ) : null}
      <main className="view">
        {view === 'month' && <MonthGrid anchor={anchor} now={now} byDay={byDay} />}
        {view === 'week' && <WeekView anchor={anchor} now={now} byDay={byDay} />}
        {view === 'agenda' && <AgendaList now={now} byDay={byDay} start={start} end={end} />}
      </main>
    </div>
  )
}
