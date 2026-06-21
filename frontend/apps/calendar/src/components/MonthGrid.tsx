import { addDays, dayKey, monthGridRange } from '../dates'
import type { CalendarEvent } from '../types'
import { EventPill } from './EventPill'

interface Props {
  anchor: Date
  now: Date
  byDay: Map<string, CalendarEvent[]>
  onAddDay: (dayKey: string) => void
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_PILLS = 4

export function MonthGrid({ anchor, now, byDay, onAddDay }: Props) {
  const { gridStart } = monthGridRange(anchor)
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  const todayKey = dayKey(now)
  const currentMonth = anchor.getMonth()

  return (
    <div className="month">
      <div className="weekday-row">
        {WEEKDAYS.map((w) => (
          <div key={w} className="weekday">{w}</div>
        ))}
      </div>
      <div className="month-grid">
        {days.map((d) => {
          const key = dayKey(d)
          const events = byDay.get(key) ?? []
          const classes = [
            'day-cell',
            key === todayKey ? 'today' : '',
            d.getMonth() !== currentMonth ? 'other-month' : '',
          ].filter(Boolean).join(' ')
          return (
            <div
              key={key}
              className={classes}
              role="button"
              tabIndex={0}
              onClick={() => onAddDay(key)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onAddDay(key)}
              title="Add an event on this day"
            >
              <div className="day-number">{d.getDate()}</div>
              <div className="day-events">
                {events.slice(0, MAX_PILLS).map((ev, i) => (
                  <EventPill key={`${ev.id}-${i}`} event={ev} />
                ))}
                {events.length > MAX_PILLS ? (
                  <div className="more">+{events.length - MAX_PILLS} more</div>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
