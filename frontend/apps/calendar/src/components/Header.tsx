import type { View } from '../types'

interface Props {
  view: View
  onView: (v: View) => void
  anchor: Date
  now: Date
  loading: boolean
  lastUpdated: Date | null
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const VIEWS: View[] = ['month', 'week', 'agenda']

function periodLabel(view: View, anchor: Date): string {
  if (view === 'month') return `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`
  if (view === 'week') {
    const start = new Date(anchor)
    start.setDate(anchor.getDate() - anchor.getDay())
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    const fmt = (d: Date) => `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`
    return `${fmt(start)} – ${fmt(end)}`
  }
  return 'Upcoming'
}

export function Header({
  view, onView, anchor, now, loading, lastUpdated, onPrev, onNext, onToday,
}: Props) {
  const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const date = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  const updated = lastUpdated
    ? lastUpdated.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : null

  return (
    <header className="header">
      <div className="header-left">
        <div className="clock">{time}</div>
        <div className="today-date">{date}</div>
      </div>

      <div className="header-center">
        <h1 className="period">{periodLabel(view, anchor)}</h1>
        {loading ? <span className="dot" title="Refreshing…" /> : null}
        {updated ? <span className="updated">updated {updated}</span> : null}
      </div>

      <div className="header-right">
        <div className="nav">
          <button onClick={onPrev} aria-label="Previous">‹</button>
          <button onClick={onToday}>Today</button>
          <button onClick={onNext} aria-label="Next">›</button>
        </div>
        <div className="segmented">
          {VIEWS.map((v) => (
            <button
              key={v}
              className={v === view ? 'active' : ''}
              onClick={() => onView(v)}
            >
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
