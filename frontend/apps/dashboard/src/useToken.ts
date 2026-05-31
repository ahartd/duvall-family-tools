import { useEffect, useState } from 'react'

const STORAGE_KEY = 'calendarToken'

// Same "secret link" token as the calendar app (shared STORAGE_KEY). Kept in the
// URL (not stripped) so an iOS "Add to Home Screen" bookmark carries it — a
// standalone home-screen web app has storage isolated from Safari.
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
