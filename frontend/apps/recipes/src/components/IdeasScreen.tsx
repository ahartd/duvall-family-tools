import { useMemo, useState } from 'react'
import type { RecipeData } from '../types'
import { RecipeImage } from './RecipeImage'

function shuffled<T>(arr: T[]): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function pick<T>(arr: T[]): T | undefined {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined
}

export function IdeasScreen({ data, onBrowse }: { data: RecipeData; onBrowse: () => void }) {
  const [seed, setSeed] = useState(0)
  const linked = useMemo(() => data.recipes.filter((r) => r.url), [data.recipes])

  // Re-rolled whenever "Surprise me" bumps the seed.
  const { night, quick, side } = useMemo(() => {
    void seed
    return {
      night: pick(data.mealNights),
      quick: shuffled(linked).slice(0, 6),
      side: pick(data.sides),
    }
  }, [seed, data.mealNights, data.sides, linked])

  return (
    <div className="ideas">
      <div className="ideas-bar">
        <p className="ideas-prompt">What should we make?</p>
        <button className="shuffle" onClick={() => setSeed((s) => s + 1)}>
          🎲 Surprise me
        </button>
      </div>

      {night ? (
        <section className="night card">
          <div className="night-head">
            <h2 className="night-title">{night.title}</h2>
            <p className="night-desc">{night.description}</p>
          </div>
          <div className="night-recipes">
            {night.recipes.map((r) => (
              <a
                key={r.title + r.url}
                className="dish"
                href={r.url}
                target="_blank"
                rel="noreferrer"
              >
                <RecipeImage src={r.image} alt={r.title} />
                <span className="dish-title">{r.title}</span>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <div className="ideas-cols">
        <section className="card quick">
          <h3 className="card-h">Quick picks</h3>
          <ul className="quick-list">
            {quick.map((r) => (
              <li key={r.title}>
                <a href={r.url} target="_blank" rel="noreferrer" className="quick-item">
                  <span className="quick-name">{r.title}</span>
                  {r.tags[0] ? <span className="chip chip--sm">{r.tags[0]}</span> : null}
                </a>
              </li>
            ))}
          </ul>
          <button className="link-btn" onClick={onBrowse}>
            Browse all {data.recipes.length} recipes →
          </button>
        </section>

        {side ? (
          <section className="card side">
            <h3 className="card-h">Side idea</h3>
            <a className="dish dish--wide" href={side.url} target="_blank" rel="noreferrer">
              <RecipeImage src={side.image} alt={side.title} />
              <span className="dish-title">{side.title}</span>
            </a>
          </section>
        ) : null}
      </div>
    </div>
  )
}
