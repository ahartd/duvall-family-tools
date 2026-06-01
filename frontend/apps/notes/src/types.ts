export type NoteItem = {
  id: string
  listId: string
  text: string
  checked: boolean
  createdAt: string
}

export type NoteList = {
  id: string
  title: string
  archived: boolean
  createdAt: string
  archivedAt: string
  items: NoteItem[]
}
