import { useCallback, useEffect, useRef, useState } from 'react'
import { AppNav } from './components/AppNav'
import { ListCard } from './components/ListCard'
import { useToken } from './useToken'
import {
  addItem,
  addList,
  deleteItem,
  deleteList,
  fetchLists,
  patchItem,
  patchList,
} from './api'
import type { NoteItem, NoteList } from './types'

const REFRESH_MS = 30 * 1000

export default function App() {
  const { token, ready } = useToken()
  const [lists, setLists] = useState<NoteList[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const ctrl = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    try {
      const all = await fetchLists(token, showArchived, c.signal)
      if (c.signal.aborted) return
      // Archived view shows only archived; active view returns active already.
      setLists(showArchived ? all.filter((l) => l.archived) : all)
      setError('')
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setError((e as Error).message || 'Failed to load lists.')
    } finally {
      if (!c.signal.aborted) setLoading(false)
    }
  }, [token, showArchived])

  useEffect(() => {
    if (!ready) return
    setLoading(true)
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

  const fail = (e: unknown) => {
    setError((e as Error).message)
    load()
  }

  const createList = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = newTitle.trim()
    if (!t) return
    setNewTitle('')
    try {
      const created = await addList(token, t)
      if (!showArchived) setLists((prev) => [...prev, created])
    } catch (err) {
      fail(err)
    }
  }

  // --- item handlers (optimistic) ---
  const patchListItems = (listId: string, fn: (items: NoteItem[]) => NoteItem[]) =>
    setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, items: fn(l.items) } : l)))

  const handleAddItem = async (listId: string, text: string) => {
    try {
      const item = await addItem(token, listId, text)
      patchListItems(listId, (items) => [...items, item])
    } catch (err) {
      fail(err)
    }
  }

  const handleToggleItem = async (item: NoteItem) => {
    const checked = !item.checked
    patchListItems(item.listId, (items) =>
      items.map((i) => (i.id === item.id ? { ...i, checked } : i)),
    )
    try {
      await patchItem(token, item.id, { checked })
    } catch (err) {
      fail(err)
    }
  }

  const handleDeleteItem = async (item: NoteItem) => {
    patchListItems(item.listId, (items) => items.filter((i) => i.id !== item.id))
    try {
      await deleteItem(token, item.id)
    } catch (err) {
      fail(err)
    }
  }

  // --- list handlers ---
  const setArchived = async (list: NoteList, archived: boolean) => {
    setLists((prev) => prev.filter((l) => l.id !== list.id))
    try {
      await patchList(token, list.id, { archived })
    } catch (err) {
      fail(err)
    }
  }

  const removeList = async (list: NoteList) => {
    if (!confirm(`Delete “${list.title}” and its items?`)) return
    setLists((prev) => prev.filter((l) => l.id !== list.id))
    try {
      await deleteList(token, list.id)
    } catch (err) {
      fail(err)
    }
  }

  return (
    <div className="app">
      <AppNav current="notes" />
      <header className="head">
        <h1>{showArchived ? 'Archived' : 'Notes & Lists'}</h1>
        <button className="toggle" onClick={() => setShowArchived((s) => !s)}>
          {showArchived ? '← Active' : 'Archived'}
        </button>
      </header>

      {!showArchived ? (
        <form className="add-list" onSubmit={createList}>
          <input
            placeholder="New list (e.g. Groceries)…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <button type="submit" disabled={!newTitle.trim()}>
            Add list
          </button>
        </form>
      ) : null}

      {error ? (
        <div className="banner error">
          {error}
          {!token ? ' — open via the secret link (…/notes/?token=YOUR_TOKEN).' : ''}
        </div>
      ) : null}

      <main className="board">
        {loading && lists.length === 0 ? <p className="muted">Loading…</p> : null}
        {!loading && lists.length === 0 ? (
          <p className="muted">
            {showArchived ? 'No archived lists.' : 'No lists yet — create one above. 📝'}
          </p>
        ) : null}
        <div className="cards">
          {lists.map((list) => (
            <ListCard
              key={list.id}
              list={list}
              archived={showArchived}
              onAddItem={handleAddItem}
              onToggleItem={handleToggleItem}
              onDeleteItem={handleDeleteItem}
              onArchive={(l) => setArchived(l, true)}
              onUnarchive={(l) => setArchived(l, false)}
              onDelete={removeList}
            />
          ))}
        </div>
      </main>
    </div>
  )
}
