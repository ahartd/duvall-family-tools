import { addDays, dayKey, startOfDay } from '../dates'
import type { CalendarEvent } from '../types'
import { EventPill } from './EventPill'

interface Props {
  anchor: Date
  now: Date
  byDay: Map<string, CalendarEvent[]>
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function WeekView({ anchor, now, byDay }: Props) {
  const start = addDays(startOfDay(anchor), -anchor.getDay())
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const todayKey = dayKey(now)

  return (
    <div className="week">
      {days.map((d) => {
        const key = dayKey(d)
        const events = byDay.get(key) ?? []
        return (
          <div key={key} className={`week-col${key === todayKey ? ' today' : ''}`}>
            <div className="week-head">
              <span className="week-dow">{WEEKDAYS[d.getDay()]}</span>
              <span className="week-num">{d.getDate()}</span>
            </div>
            <div className="week-events">
              {events.length === 0 ? (
                <div className="week-empty">—</div>
              ) : (
                events.map((ev, i) => <EventPill key={`${ev.id}-${i}`} event={ev} />)
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
