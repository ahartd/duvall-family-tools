import { useMemo, useState } from 'react'
import type { Recipe } from '../types'

const PAGE = 90 // cards rendered per "Show more" step (keeps the iPad snappy)

export function BrowseScreen({ recipes }: { recipes: Recipe[] }) {
  const [q, setQ] = useState('')
  const [tag, setTag] = useState<string>('') // '' = all
  const [limit, setLimit] = useState(PAGE)

  // Tag chips, most-common first.
  const tags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of recipes) for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
  }, [recipes])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return recipes.filter((r) => {
      if (tag && !r.tags.includes(tag)) return false
      if (!needle) return true
      return r.title.toLowerCase().includes(needle) || r.notes.toLowerCase().includes(needle)
    })
  }, [recipes, q, tag])

  // Reset paging whenever the query/filter changes.
  const visible = filtered.slice(0, limit)

  return (
    <div className="browse">
      <div className="browse-controls">
        <input
          className="search"
          type="search"
          placeholder="Search recipes…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setLimit(PAGE)
          }}
        />
        <div className="chips">
          <button
            className={'chip' + (tag === '' ? ' is-active' : '')}
            onClick={() => {
              setTag('')
              setLimit(PAGE)
            }}
          >
            All
          </button>
          {tags.map((t) => (
            <button
              key={t}
              className={'chip' + (tag === t ? ' is-active' : '')}
              onClick={() => {
                setTag(t === tag ? '' : t)
                setLimit(PAGE)
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <p className="count">
          {filtered.length} recipe{filtered.length === 1 ? '' : 's'}
        </p>
      </div>

      <ul className="recipe-grid">
        {visible.map((r) => (
          <li key={r.title} className="recipe-card">
            <div className="recipe-card-top">
              <span className="recipe-name">{r.title}</span>
              {r.url ? (
                <a className="open" href={r.url} target="_blank" rel="noreferrer">
                  Open ↗
                </a>
              ) : null}
            </div>
            {r.notes ? <p className="recipe-notes">{r.notes}</p> : null}
            {r.tags.length ? (
              <div className="recipe-tags">
                {r.tags.map((t) => (
                  <span key={t} className="chip chip--sm">
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {filtered.length === 0 ? <p className="empty">No matches — try another search.</p> : null}
      {limit < filtered.length ? (
        <button className="more" onClick={() => setLimit((n) => n + PAGE)}>
          Show more ({filtered.length - limit} left)
        </button>
      ) : null}
    </div>
  )
}
