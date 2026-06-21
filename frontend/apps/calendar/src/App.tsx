import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchEvents } from './api'
import { useToken } from './useToken'
import { bucketByDay } from './events'
import { addDays, dayKey, monthGridRange, startOfDay } from './dates'
import type { CalendarEvent, View } from './types'
import { AppNav } from './components/AppNav'
import { Header } from './components/Header'
import { MonthGrid } from './components/MonthGrid'
import { AgendaList } from './components/AgendaList'
import { WeekView } from './components/WeekView'
import { EventForm } from './components/EventForm'

const DATA_REFRESH_MS = 5 * 60 * 1000 // re-fetch events every 5 minutes
const CLOCK_TICK_MS = 30 * 1000 // update the clock / "today" highlight
const AUTO_RETURN_MS = 10 * 60 * 1000 // re-center on "today" after this much idle
const RELOAD_HOUR = 4 // local hour for the once-a-day kiosk reload

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

// True when the anchored period already contains `today`, so a kiosk left idle
// only re-centers once the date has actually moved on (e.g. across midnight).
function isShowingPeriod(view: View, anchor: Date, today: Date): boolean {
  if (view === 'month') {
    return (
      anchor.getFullYear() === today.getFullYear() &&
      anchor.getMonth() === today.getMonth()
    )
  }
  if (view === 'week') {
    const aStart = addDays(startOfDay(anchor), -anchor.getDay())
    const tStart = addDays(startOfDay(today), -today.getDay())
    return dayKey(aStart) === dayKey(tStart)
  }
  return dayKey(startOfDay(anchor)) === dayKey(startOfDay(today))
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
  // When set, the add-event form is open, pre-filled with this YYYY-MM-DD.
  const [addDate, setAddDate] = useState<string | null>(null)

  const { start, end } = useMemo(() => rangeFor(view, anchor), [view, anchor])

  // Track the in-flight request so a newer load always supersedes an older one
  // (e.g. a periodic/visibility refresh overlapping a view or month change).
  const inFlight = useRef<AbortController | null>(null)

  // Timestamp of the last manual interaction; gates kiosk auto-return so we
  // don't yank the view back to "today" while someone is browsing other months.
  const lastInteraction = useRef<number>(Date.now())
  const markInteraction = useCallback(() => {
    lastInteraction.current = Date.now()
  }, [])

  // Open the add-event form pre-filled to a given day (also counts as activity
  // so the kiosk doesn't auto-return while someone is mid-entry).
  const openAdd = useCallback(
    (key: string) => {
      markInteraction()
      setAddDate(key)
    },
    [markInteraction],
  )

  // Show the new event immediately; the next poll (cache was bumped server-side)
  // returns the authoritative list and replaces this optimistic copy.
  const onCreated = useCallback((ev: CalendarEvent) => {
    setEvents((prev) => [...prev, ev])
    setAddDate(null)
  }, [])

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

  // Kiosk auto-return: when left idle, keep the view on the current period so it
  // rolls over at midnight / month boundaries with nobody touching the iPad.
  useEffect(() => {
    const id = setInterval(() => {
      if (Date.now() - lastInteraction.current < AUTO_RETURN_MS) return
      const today = new Date()
      if (!isShowingPeriod(view, anchor, today)) setAnchor(today)
    }, 60 * 1000)
    return () => clearInterval(id)
  }, [view, anchor])

  // Kiosk daily reload: reload once a day (at RELOAD_HOUR local, or on the next
  // wake after it) so the display picks up new deploys without intervention.
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

  const byDay = useMemo(() => bucketByDay(events), [events])

  return (
    <div className="app">
      <AppNav current="calendar" />
      <Header
        view={view}
        onView={(v) => {
          markInteraction()
          setView(v)
        }}
        anchor={anchor}
        now={now}
        loading={loading}
        lastUpdated={lastUpdated}
        onPrev={() => {
          markInteraction()
          setAnchor((a) => shift(view, a, -1))
        }}
        onNext={() => {
          markInteraction()
          setAnchor((a) => shift(view, a, 1))
        }}
        onToday={() => {
          markInteraction()
          setAnchor(new Date())
        }}
        onAdd={() => openAdd(dayKey(now))}
      />
      {error ? (
        <div className="banner error">
          {error}
          {!token ? ' — open the calendar via its secret link (…/calendar/?token=YOUR_TOKEN).' : ''}
        </div>
      ) : null}
      <main className="view">
        {view === 'month' && <MonthGrid anchor={anchor} now={now} byDay={byDay} onAddDay={openAdd} />}
        {view === 'week' && <WeekView anchor={anchor} now={now} byDay={byDay} onAddDay={openAdd} />}
        {view === 'agenda' && <AgendaList now={now} byDay={byDay} start={start} end={end} />}
      </main>
      {addDate !== null ? (
        <EventForm
          token={token}
          initialDate={addDate}
          onClose={() => setAddDate(null)}
          onCreated={onCreated}
        />
      ) : null}
    </div>
  )
}
