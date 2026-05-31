// Slim cross-app switcher shown at the top of every micro-app, so the wall
// iPad can hop between tools without retyping URLs. A copy lives in each app
// (matching this repo's "each app is self-contained" convention).

type AppKey = 'dashboard' | 'calendar' | 'recipes'

const APPS: { key: AppKey; label: string; href: string; icon: string }[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard/', icon: '🏠' },
  { key: 'calendar', label: 'Calendar', href: '/calendar/', icon: '📅' },
  { key: 'recipes', label: 'Recipes', href: '/recipes/', icon: '🍳' },
]

// Carry the secret-link ?token across apps. iOS standalone (home-screen) mode
// gets its own storage partition, so the token can't be relied on in
// localStorage there — it has to ride along in the URL.
function withToken(href: string): string {
  const token = new URL(window.location.href).searchParams.get('token')
  return token ? `${href}?token=${encodeURIComponent(token)}` : href
}

export function AppNav({ current }: { current: AppKey }) {
  return (
    <nav className="app-nav" aria-label="Switch apps">
      <a className="app-nav__home" href={withToken('/')} title="All tools" aria-label="All tools">
        ⠿
      </a>
      <div className="app-nav__apps">
        {APPS.map((a) => (
          <a
            key={a.key}
            href={withToken(a.href)}
            className={'app-nav__link' + (a.key === current ? ' is-active' : '')}
            aria-current={a.key === current ? 'page' : undefined}
          >
            <span className="app-nav__icon" aria-hidden="true">
              {a.icon}
            </span>
            <span className="app-nav__label">{a.label}</span>
          </a>
        ))}
      </div>
    </nav>
  )
}
