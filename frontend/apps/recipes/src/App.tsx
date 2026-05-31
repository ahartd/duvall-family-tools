import { useEffect, useState } from 'react'
import { AppNav } from './components/AppNav'
import { IdeasScreen } from './components/IdeasScreen'
import { BrowseScreen } from './components/BrowseScreen'
import data from './data/recipes.json'
import type { RecipeData } from './types'

const RECIPES = data as RecipeData
const RELOAD_HOUR = 4 // once-a-day kiosk reload (local hour), matching the other apps

type Tab = 'ideas' | 'browse'

export default function App() {
  const [tab, setTab] = useState<Tab>('ideas')

  // Kiosk daily reload so a wall display quietly picks up new deploys.
  useEffect(() => {
    const next = new Date()
    next.setHours(RELOAD_HOUR, 0, 0, 0)
    if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1)
    const target = next.getTime()
    const id = setInterval(() => {
      if (Date.now() >= target) window.location.reload()
    }, 60 * 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="app">
      <AppNav current="recipes" />
      <header className="rec-head">
        <h1 className="rec-title">Recipes</h1>
        <div className="segmented">
          <button className={tab === 'ideas' ? 'active' : ''} onClick={() => setTab('ideas')}>
            Ideas
          </button>
          <button className={tab === 'browse' ? 'active' : ''} onClick={() => setTab('browse')}>
            Browse
          </button>
        </div>
      </header>

      <main className="rec-main">
        {tab === 'ideas' ? (
          <IdeasScreen data={RECIPES} onBrowse={() => setTab('browse')} />
        ) : (
          <BrowseScreen recipes={RECIPES.recipes} />
        )}
      </main>
    </div>
  )
}
