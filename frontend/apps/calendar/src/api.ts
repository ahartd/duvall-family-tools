import type { EventsResponse } from './types'

export interface ApiError extends Error {
  status?: number
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

  if (!res.ok) {
    let detail = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (body?.detail) detail = body.detail
    } catch {
      /* response had no JSON body */
    }
    const err: ApiError = new Error(detail)
    err.status = res.status
    throw err
  }
  return res.json()
}
