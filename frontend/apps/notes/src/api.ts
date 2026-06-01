import type { NoteItem, NoteList } from './types'

function headers(token: string): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h['X-Calendar-Token'] = token
  return h
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `Request failed (${res.status})`
    try {
      detail = (await res.json()).detail || detail
    } catch {
      /* non-JSON error */
    }
    throw new Error(detail)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

export async function fetchLists(
  token: string,
  includeArchived: boolean,
  signal?: AbortSignal,
): Promise<NoteList[]> {
  const url = includeArchived ? '/api/notes/lists?archived=1' : '/api/notes/lists'
  const data = await parse<{ lists: NoteList[] }>(
    await fetch(url, { headers: headers(token), signal }),
  )
  return data.lists
}

export async function addList(token: string, title: string): Promise<NoteList> {
  return parse<NoteList>(
    await fetch('/api/notes/lists', {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({ title }),
    }),
  )
}

export async function patchList(
  token: string,
  id: string,
  patch: { title?: string; archived?: boolean },
): Promise<NoteList> {
  return parse<NoteList>(
    await fetch(`/api/notes/lists/${id}`, {
      method: 'PATCH',
      headers: headers(token),
      body: JSON.stringify(patch),
    }),
  )
}

export async function deleteList(token: string, id: string): Promise<void> {
  await parse<void>(
    await fetch(`/api/notes/lists/${id}`, { method: 'DELETE', headers: headers(token) }),
  )
}

export async function addItem(token: string, listId: string, text: string): Promise<NoteItem> {
  return parse<NoteItem>(
    await fetch('/api/notes/items', {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({ listId, text }),
    }),
  )
}

export async function patchItem(
  token: string,
  id: string,
  patch: { text?: string; checked?: boolean },
): Promise<NoteItem> {
  return parse<NoteItem>(
    await fetch(`/api/notes/items/${id}`, {
      method: 'PATCH',
      headers: headers(token),
      body: JSON.stringify(patch),
    }),
  )
}

export async function deleteItem(token: string, id: string): Promise<void> {
  await parse<void>(
    await fetch(`/api/notes/items/${id}`, { method: 'DELETE', headers: headers(token) }),
  )
}
