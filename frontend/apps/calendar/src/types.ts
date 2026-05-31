export type View = 'month' | 'week' | 'agenda'

export interface CalendarEvent {
  id: string
  summary: string
  start: string // ISO 8601 — a date (all-day) or a datetime with offset
  end: string
  allDay: boolean
  location: string
  status: string
  htmlLink: string
}

export interface EventsResponse {
  events: CalendarEvent[]
  timeMin: string
  timeMax: string
}
