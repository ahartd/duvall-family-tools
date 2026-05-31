import type { Weather } from '../types'
import { dayName, temp, weatherInfo } from '../weather'

export function WeatherPanel({ weather }: { weather: Weather }) {
  const c = weather.current
  const now = weatherInfo(c.code)
  const today = weather.daily[0]

  return (
    <section className="weather">
      <div className="weather-now">
        <span className="weather-emoji">{now.emoji}</span>
        <div className="weather-main">
          <div className="weather-temp">{temp(c.temp)}</div>
          <div className="weather-label">{now.label}</div>
          <div className="weather-sub">
            Feels {temp(c.feelsLike)}
            {today ? ` · H ${temp(today.max)} · L ${temp(today.min)}` : ''}
            {today && today.precipProb != null ? ` · 💧 ${today.precipProb}%` : ''}
          </div>
        </div>
      </div>

      <div className="weather-forecast">
        {weather.daily.slice(1, 6).map((d) => {
          const info = weatherInfo(d.code)
          return (
            <div key={d.date} className="forecast-day">
              <span className="forecast-dow">{dayName(d.date)}</span>
              <span className="forecast-emoji">{info.emoji}</span>
              <span className="forecast-temps">
                <span className="forecast-hi">{temp(d.max)}</span>
                <span className="forecast-lo">{temp(d.min)}</span>
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
