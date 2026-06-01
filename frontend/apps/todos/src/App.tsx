import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppNav } from './components/AppNav'
import { useToken } from './useToken'
import { addTodo, deleteTodo, fetchTodos, patchTodo } from './api'
import type { Todo } from './types'

const REFRESH_MS = 30 * 1000

// Local YYYY-MM-DD for "today" so all-day due dates compare in the device's tz.
function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

function dueInfo(due: string): { label: string; tone: '' | 'overdue' | 'today' } {
  if (!due) return { label: '', tone: '' }
  const today = todayKey()
  // Parse as a local date (never new Date('YYYY-MM-DD'), which is UTC).
  const [y, m, d] = due.split('-').map(Number)
  const date = new Date(y, (m || 1) - 1, d || 1)
  const label = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  if (due < today) return { label, tone: 'overdue' }
  if (due === today) return { label: 'Today', tone: 'today' }
  return { label, tone: '' }
}

// Active todos: overdue/dated first (soonest first), undated last, then newest.
function sortActive(a: Todo, b: Todo): number {
  if (!!a.due !== !!b.due) return a.due ? -1 : 1
  if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1
  return a.createdAt < b.createdAt ? 1 : -1
}

export default function App() {
  const { token, ready } = useToken()
  const [todos, setTodos] = useState<Todo[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const ctrl = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    try {
      const data = await fetchTodos(token, c.signal)
      if (c.signal.aborted) return
      setTodos(data)
      setError('')
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setError((e as Error).message || 'Failed to load to-dos.')
    } finally {
      if (!c.signal.aborted) setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (!ready) return
    load()
    return () => ctrl.current?.abort()
  }, [ready, load])

  useEffect(() => {
    const id = setInterval(load, REFRESH_MS)
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    setTitle('')
    setDue('')
    try {
      const created = await addTodo(token, t, due)
      setTodos((prev) => [created, ...prev])
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const toggle = async (todo: Todo) => {
    const done = !todo.done
    setTodos((prev) => prev.map((x) => (x.id === todo.id ? { ...x, done } : x)))
    try {
      await patchTodo(token, todo.id, { done })
    } catch (err) {
      setError((err as Error).message)
      load()
    }
  }

  const remove = async (todo: Todo) => {
    setTodos((prev) => prev.filter((x) => x.id !== todo.id))
    try {
      await deleteTodo(token, todo.id)
    } catch (err) {
      setError((err as Error).message)
      load()
    }
  }

  const { active, done } = useMemo(() => {
    const active = todos.filter((t) => !t.done).sort(sortActive)
    const done = todos
      .filter((t) => t.done)
      .sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1))
    return { active, done }
  }, [todos])

  return (
    <div className="app">
      <AppNav current="todos" />
      <header className="head">
        <h1>To-Dos</h1>
        {active.length > 0 ? <span className="count">{active.length} open</span> : null}
      </header>

      <form className="add" onSubmit={submit}>
        <input
          className="add-title"
          placeholder="Add a to-do…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className="add-due"
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          aria-label="Due date"
        />
        <button className="add-btn" type="submit" disabled={!title.trim()}>
          Add
        </button>
      </form>

      {error ? (
        <div className="banner error">
          {error}
          {!token ? ' — open via the secret link (…/todos/?token=YOUR_TOKEN).' : ''}
        </div>
      ) : null}

      <main className="list">
        {loading && todos.length === 0 ? <p className="muted">Loading…</p> : null}
        {!loading && active.length === 0 && done.length === 0 ? (
          <p className="muted">Nothing yet — add your first to-do above. 🎉</p>
        ) : null}

        <ul className="rows">
          {active.map((t) => {
            const d = dueInfo(t.due)
            return (
              <li key={t.id} className="row">
                <button
                  className="check"
                  onClick={() => toggle(t)}
                  aria-label="Mark done"
                  role="checkbox"
                  aria-checked="false"
                />
                <span className="row-title">{t.title}</span>
                {d.label ? <span className={`due ${d.tone}`}>{d.label}</span> : null}
                <button className="del" onClick={() => remove(t)} aria-label="Delete">
                  ✕
                </button>
              </li>
            )
          })}
        </ul>

        {done.length > 0 ? (
          <details className="done-wrap">
            <summary>Done ({done.length})</summary>
            <ul className="rows">
              {done.map((t) => (
                <li key={t.id} className="row is-done">
                  <button
                    className="check checked"
                    onClick={() => toggle(t)}
                    aria-label="Mark not done"
                    role="checkbox"
                    aria-checked="true"
                  >
                    ✓
                  </button>
                  <span className="row-title">{t.title}</span>
                  <button className="del" onClick={() => remove(t)} aria-label="Delete">
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </main>
    </div>
  )
}
