import { useEffect, useState } from 'react'

const STORAGE_KEY = 'calendarToken'

// Resolves the "secret link" token: read it from the URL the first time, persist
// it to localStorage, then strip it from the visible URL bar (so a kiosk iPad
// doesn't display the secret). Subsequent loads reuse the stored value, so a
// bare /calendar/ reload keeps working. `ready` flips true once resolved, which
// lets the app avoid an initial request with an empty token.
export function useToken(): { token: string; ready: boolean } {
  const [token, setToken] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const url = new URL(window.location.href)
    const fromUrl = url.searchParams.get('token')
    if (fromUrl) {
      localStorage.setItem(STORAGE_KEY, fromUrl)
      url.searchParams.delete('token')
      window.history.replaceState({}, '', url.pathname + url.search + url.hash)
      setToken(fromUrl)
    } else {
      setToken(localStorage.getItem(STORAGE_KEY) ?? '')
    }
    setReady(true)
  }, [])

  return { token, ready }
}
