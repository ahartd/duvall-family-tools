import type { Todo } from './types'

// The secret-link token rides in the X-Calendar-Token header (kept out of access
// logs), matching the calendar/dashboard apps.
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

export async function fetchTodos(token: string, signal?: AbortSignal): Promise<Todo[]> {
  const res = await fetch('/api/todos/', { headers: headers(token), signal })
  const data = await parse<{ todos: Todo[] }>(res)
  return data.todos
}

export async function addTodo(token: string, title: string, due: string): Promise<Todo> {
  const res = await fetch('/api/todos/', {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ title, due }),
  })
  return parse<Todo>(res)
}

export async function patchTodo(
  token: string,
  id: string,
  patch: Partial<Pick<Todo, 'title' | 'due' | 'done'>>,
): Promise<Todo> {
  const res = await fetch(`/api/todos/${id}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify(patch),
  })
  return parse<Todo>(res)
}

export async function deleteTodo(token: string, id: string): Promise<void> {
  const res = await fetch(`/api/todos/${id}`, { method: 'DELETE', headers: headers(token) })
  await parse<void>(res)
}
