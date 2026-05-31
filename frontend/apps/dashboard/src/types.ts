export interface CalendarEvent {
  id: string
  summary: string
  start: string
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

export interface WeatherDay {
  date: string
  code: number | null
  max: number | null
  min: number | null
  precipProb: number | null
}

export interface Weather {
  current: {
    temp: number | null
    feelsLike: number | null
    code: number | null
    isDay: boolean
  }
  daily: WeatherDay[]
  unit: string
  timezone: string
}
