import type { CalendarEvent } from '../types'

function timeLabel(ev: CalendarEvent): string {
  if (ev.allDay) return 'All day'
  return new Date(ev.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function Agenda({ events }: { events: CalendarEvent[] }) {
  const sorted = [...events].sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
    return a.start.localeCompare(b.start)
  })

  return (
    <section className="agenda">
      <h2 className="agenda-title">Today</h2>
      {sorted.length === 0 ? (
        <p className="agenda-empty">Nothing on the calendar today 🎉</p>
      ) : (
        <ul className="agenda-list">
          {sorted.map((ev, i) => (
            <li key={`${ev.id}-${i}`} className={`agenda-item${ev.allDay ? ' all-day' : ''}`}>
              <span className="agenda-time">{timeLabel(ev)}</span>
              <span className="agenda-text">
                <span className="agenda-summary">{ev.summary}</span>
                {ev.location ? <span className="agenda-loc">{ev.location}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
