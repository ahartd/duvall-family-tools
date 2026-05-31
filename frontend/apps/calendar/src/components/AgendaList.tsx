import { addDays, dayKey, startOfDay } from '../dates'
import type { CalendarEvent } from '../types'

interface Props {
  now: Date
  byDay: Map<string, CalendarEvent[]>
  start: Date
  end: Date
}

function eventTime(ev: CalendarEvent): string {
  if (ev.allDay) return 'All day'
  return new Date(ev.start).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function AgendaList({ now, byDay, start, end }: Props) {
  const days: Date[] = []
  let cur = startOfDay(start)
  const last = startOfDay(end)
  while (cur < last) {
    days.push(cur)
    cur = addDays(cur, 1)
  }

  const todayKey = dayKey(now)
  const nonEmpty = days.filter((d) => (byDay.get(dayKey(d)) ?? []).length > 0)

  if (nonEmpty.length === 0) {
    return <div className="agenda empty">No upcoming events.</div>
  }

  return (
    <div className="agenda">
      {nonEmpty.map((d) => {
        const key = dayKey(d)
        const events = byDay.get(key) ?? []
        const label = d.toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        })
        return (
          <section key={key} className={`agenda-day${key === todayKey ? ' today' : ''}`}>
            <h2 className="agenda-date">{label}</h2>
            <ul className="agenda-events">
              {events.map((ev, i) => (
                <li key={`${ev.id}-${i}`} className="agenda-event">
                  <span className="agenda-time">{eventTime(ev)}</span>
                  <span className="agenda-title">{ev.summary}</span>
                  {ev.location ? <span className="agenda-location">{ev.location}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
