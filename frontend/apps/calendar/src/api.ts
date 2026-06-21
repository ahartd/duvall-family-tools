import type { CalendarEvent, EventsResponse } from './types'

export interface ApiError extends Error {
  status?: number
}

// Fields for creating an event. For an all-day event set `allDay` and `date`
// (YYYY-MM-DD). For a timed event set `start`/`end` as LOCAL ISO datetimes
// (YYYY-MM-DDTHH:mm:ss, no offset) plus the IANA `timeZone`, so the server can
// anchor the event correctly (DST-safe) without us doing offset math.
export interface NewEvent {
  summary: string
  allDay: boolean
  date?: string
  start?: string
  end?: string
  timeZone?: string
  location?: string
}

async function parseError(res: Response): Promise<ApiError> {
  let detail = `Request failed (${res.status})`
  try {
    const body = await res.json()
    if (body?.detail) detail = body.detail
  } catch {
    /* response had no JSON body */
  }
  const err: ApiError = new Error(detail)
  err.status = res.status
  return err
}

// Fetches events from the Django API. The shared token is sent ONLY as the
// X-Calendar-Token header (never as a query param), so it can't leak into
// server access logs or browser history.
export async function fetchEvents(
  token: string,
  timeMin: Date,
  timeMax: Date,
  signal?: AbortSignal,
): Promise<EventsResponse> {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
  })

  const res = await fetch(`/api/calendar/events?${params.toString()}`, {
    signal,
    headers: token ? { 'X-Calendar-Token': token } : undefined,
  })

  if (!res.ok) throw await parseError(res)
  return res.json()
}

// Creates an event on the linked calendar. The token is sent ONLY as a header
// (never a query param), matching fetchEvents. Returns the created event so the
// caller can show it immediately without waiting for the next poll.
export async function createEvent(
  token: string,
  event: NewEvent,
  signal?: AbortSignal,
): Promise<CalendarEvent> {
  const res = await fetch('/api/calendar/events', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-Calendar-Token': token } : {}),
    },
    body: JSON.stringify(event),
  })

  if (!res.ok) throw await parseError(res)
  return res.json()
}
