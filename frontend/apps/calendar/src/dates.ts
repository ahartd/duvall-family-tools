// Local-date helpers.
//
// IMPORTANT: all-day events come from Google as floating dates ("YYYY-MM-DD")
// with no time/zone. They must be interpreted in LOCAL time, not UTC — parsing
// "2026-05-31" with `new Date(str)` yields UTC midnight, which in a negative
// offset (e.g. US timezones) renders as the previous day. `parseAllDay` builds
// a local-midnight Date to avoid that classic off-by-one bug.

export function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseAllDay(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d) // local midnight
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

// The 6×7 grid that covers a month, starting on Sunday.
export function monthGridRange(monthDate: Date): { gridStart: Date; gridEnd: Date } {
  const first = startOfMonth(monthDate)
  const gridStart = addDays(first, -first.getDay()) // back to the preceding Sunday
  const gridEnd = addDays(gridStart, 42) // 6 weeks later (exclusive)
  return { gridStart, gridEnd }
}
