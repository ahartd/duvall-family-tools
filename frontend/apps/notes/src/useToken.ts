import { useEffect, useState } from 'react'

const STORAGE_KEY = 'calendarToken'

// Resolves the "secret link" token. It's read from the URL and cached in
// localStorage. We intentionally KEEP it in the URL (no history rewrite): on
// iOS, "Add to Home Screen" bookmarks the current URL, and a standalone
// home-screen web app gets its OWN storage partition — it can't see the token
// Safari saved to localStorage. Keeping the token in the URL is therefore the
// only reliable way to carry it across the Safari -> standalone (kiosk) boundary.
// In standalone mode there's no visible address bar, so the secret isn't shown.
// `ready` flips true once resolved, so the app avoids a request with no token.
export function useToken(): { token: string; ready: boolean } {
  const [token, setToken] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const fromUrl = new URL(window.location.href).searchParams.get('token')
    if (fromUrl) {
      localStorage.setItem(STORAGE_KEY, fromUrl)
      setToken(fromUrl)
    } else {
      setToken(localStorage.getItem(STORAGE_KEY) ?? '')
    }
    setReady(true)
  }, [])

  return { token, ready }
}
