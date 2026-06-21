import { useEffect, useRef, useState } from 'react'
import { createEvent } from '../api'
import type { CalendarEvent } from '../types'

interface Props {
  token: string
  initialDate: string // YYYY-MM-DD to pre-fill (the tapped day, or today)
  onClose: () => void
  onCreated: (event: CalendarEvent) => void
}

// The device's IANA zone (e.g. "America/Los_Angeles"). Sent with timed events so
// the server anchors them correctly without us computing UTC offsets ourselves.
const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

export function EventForm({ token, initialDate, onClose, onCreated }: Props) {
  const [summary, setSummary] = useState('')
  const [date, setDate] = useState(initialDate)
  const [allDay, setAllDay] = useState(false)
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('10:00')
  const [location, setLocation] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  // Focus the title on open, and let Escape close the dialog.
  useEffect(() => {
    titleRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const title = summary.trim()
    if (!title) return setError('A title is required.')
    if (!date) return setError('A date is required.')
    if (!allDay && end <= start) return setError('The end time must be after the start time.')

    setSaving(true)
    setError('')
    try {
      const payload = allDay
        ? { summary: title, allDay: true, date, location: location.trim() }
        : {
            summary: title,
            allDay: false,
            start: `${date}T${start}:00`,
            end: `${date}T${end}:00`,
            timeZone: TIME_ZONE,
            location: location.trim(),
          }
      const created = await createEvent(token, payload)
      onCreated(created)
    } catch (err) {
      setError((err as Error).message || 'Could not create the event.')
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Add event"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">Add event</h2>
        <form className="event-form" onSubmit={submit}>
          <label className="field">
            <span>Title</span>
            <input
              ref={titleRef}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="e.g. Dentist"
            />
          </label>

          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          <label className="field field-check">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            <span>All day</span>
          </label>

          {!allDay ? (
            <div className="field-row">
              <label className="field">
                <span>Start</span>
                <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
              </label>
              <label className="field">
                <span>End</span>
                <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
              </label>
            </div>
          ) : null}

          <label className="field">
            <span>Location (optional)</span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. 123 Main St"
            />
          </label>

          {error ? <div className="form-error">{error}</div> : null}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving || !summary.trim()}>
              {saving ? 'Saving…' : 'Add event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
