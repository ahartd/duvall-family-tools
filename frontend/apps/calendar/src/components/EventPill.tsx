import type { CalendarEvent } from '../types'

function timeLabel(ev: CalendarEvent): string {
  if (ev.allDay) return ''
  return new Date(ev.start).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function EventPill({ event }: { event: CalendarEvent }) {
  const time = timeLabel(event)
  return (
    <div className={`pill${event.allDay ? ' all-day' : ''}`} title={event.summary}>
      {time ? <span className="pill-time">{time}</span> : null}
      <span className="pill-title">{event.summary}</span>
    </div>
  )
}
