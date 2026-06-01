import { useState } from 'react'
import type { NoteItem, NoteList } from '../types'

export function ListCard({
  list,
  archived,
  onAddItem,
  onToggleItem,
  onDeleteItem,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  list: NoteList
  archived: boolean
  onAddItem: (listId: string, text: string) => void
  onToggleItem: (item: NoteItem) => void
  onDeleteItem: (item: NoteItem) => void
  onArchive: (list: NoteList) => void
  onUnarchive: (list: NoteList) => void
  onDelete: (list: NoteList) => void
}) {
  const [text, setText] = useState('')
  const checked = list.items.filter((i) => i.checked).length
  const total = list.items.length

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setText('')
    onAddItem(list.id, t)
  }

  return (
    <section className="card">
      <header className="card-head">
        <h2 className="card-title">{list.title}</h2>
        {total > 0 ? (
          <span className="progress">
            {checked}/{total}
          </span>
        ) : null}
      </header>

      <ul className="items">
        {list.items.map((item) => (
          <li key={item.id} className={'item' + (item.checked ? ' is-checked' : '')}>
            <button
              className={'check' + (item.checked ? ' checked' : '')}
              onClick={() => onToggleItem(item)}
              role="checkbox"
              aria-checked={item.checked}
              aria-label={item.checked ? 'Uncheck' : 'Check'}
            >
              {item.checked ? '✓' : ''}
            </button>
            <span className="item-text">{item.text}</span>
            <button className="del" onClick={() => onDeleteItem(item)} aria-label="Remove">
              ✕
            </button>
          </li>
        ))}
        {total === 0 ? <li className="empty-item">No items yet.</li> : null}
      </ul>

      {!archived ? (
        <form className="add-item" onSubmit={submit}>
          <input
            placeholder="Add an item…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" disabled={!text.trim()}>
            +
          </button>
        </form>
      ) : null}

      <footer className="card-foot">
        {archived ? (
          <button className="act" onClick={() => onUnarchive(list)}>
            Restore
          </button>
        ) : (
          <button className="act" onClick={() => onArchive(list)}>
            Archive
          </button>
        )}
        <button className="act danger" onClick={() => onDelete(list)}>
          Delete
        </button>
      </footer>
    </section>
  )
}
