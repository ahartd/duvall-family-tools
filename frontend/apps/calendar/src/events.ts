import type { CalendarEvent } from './types'
import { addDays, dayKey, parseAllDay, startOfDay } from './dates'

// Returns every local day-key an event occupies, so multi-day events appear in
// each cell they span. Google's end is exclusive in both branches below.
export function eventDayKeys(ev: CalendarEvent): string[] {
  const keys: string[] = []
  if (ev.allDay) {
    const start = parseAllDay(ev.start)
    const endExclusive = ev.end ? parseAllDay(ev.end) : addDays(start, 1)
    let cur = start
    while (cur < endExclusive && keys.length < 60) {
      keys.push(dayKey(cur))
      cur = addDays(cur, 1)
    }
    return keys.length ? keys : [dayKey(start)]
  }
  const start = startOfDay(new Date(ev.start))
  // The timed end is an exclusive instant; step back 1ms so an event ending
  // exactly at local midnight doesn't spill into the next day's cell.
  const endSource = ev.end ? new Date(new Date(ev.end).getTime() - 1) : new Date(ev.start)
  const end = startOfDay(endSource)
  let cur = start
  while (cur <= end && keys.length < 60) {
    keys.push(dayKey(cur))
    cur = addDays(cur, 1)
  }
  return keys.length ? keys : [dayKey(start)]
}

// Buckets events by local day, sorted all-day-first then by start time.
export function bucketByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>()
  for (const ev of events) {
    for (const key of eventDayKeys(ev)) {
      const list = map.get(key) ?? []
      list.push(ev)
      map.set(key, list)
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
      return a.start.localeCompare(b.start)
    })
  }
  return map
}
