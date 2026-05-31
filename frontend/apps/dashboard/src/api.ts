import type { EventsResponse, Weather } from './types'

export interface ApiError extends Error {
  status?: number
}

// The token is sent only as a header (never a query param) so it stays out of logs.
async function getJSON<T>(url: string, token: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    signal,
    headers: token ? { 'X-Calendar-Token': token } : undefined,
  })
  if (!res.ok) {
    let detail = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (body?.detail) detail = body.detail
    } catch {
      /* no JSON body */
    }
    const err: ApiError = new Error(detail)
    err.status = res.status
    throw err
  }
  return res.json()
}

export function fetchTodayEvents(
  token: string,
  dayStart: Date,
  dayEnd: Date,
  signal?: AbortSignal,
): Promise<EventsResponse> {
  const params = new URLSearchParams({
    timeMin: dayStart.toISOString(),
    timeMax: dayEnd.toISOString(),
  })
  return getJSON<EventsResponse>(`/api/calendar/events?${params.toString()}`, token, signal)
}

export function fetchWeather(token: string, signal?: AbortSignal): Promise<Weather> {
  return getJSON<Weather>('/api/weather/', token, signal)
}
