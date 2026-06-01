"""Todos and notes, persisted as rows in the backing Google Sheet.

Three tabs:
  * ``Todos``  — id, title, due, done, created_at, completed_at
  * ``Lists``  — id, title, archived, created_at, archived_at  (a note / shopping list)
  * ``Items``  — id, list_id, text, checked, created_at        (lines within a list)

Reads are cached for a few seconds so a polling kiosk doesn't hammer the Sheets
API; every write busts the relevant cache key.
"""
from __future__ import annotations

import datetime as dt
import uuid

from django.core.cache import cache

from core.google_sheets import SheetTable

TODOS = SheetTable("Todos", ["id", "title", "due", "done", "created_at", "completed_at"])
LISTS = SheetTable("Lists", ["id", "title", "archived", "created_at", "archived_at"])
ITEMS = SheetTable("Items", ["id", "list_id", "text", "checked", "created_at"])

CACHE_TTL = 8  # seconds
_TODOS_KEY = "lists:todos"
_NOTES_KEYS = ("lists:notes:active", "lists:notes:all")


def _new_id() -> str:
    return uuid.uuid4().hex[:8]


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def _truthy(value: str) -> bool:
    return str(value).strip().upper() == "TRUE"


# --- Todos -----------------------------------------------------------------
def _todo_dto(r: dict) -> dict:
    return {
        "id": r["id"],
        "title": r.get("title", ""),
        "due": r.get("due", ""),
        "done": _truthy(r.get("done", "")),
        "createdAt": r.get("created_at", ""),
        "completedAt": r.get("completed_at", ""),
    }


def list_todos() -> list[dict]:
    cached = cache.get(_TODOS_KEY)
    if cached is None:
        cached = [_todo_dto(r) for r in TODOS.read()]
        cache.set(_TODOS_KEY, cached, CACHE_TTL)
    return cached


def add_todo(title: str, due: str = "") -> dict:
    rec = {
        "id": _new_id(),
        "title": title,
        "due": due,
        "done": "FALSE",
        "created_at": _now(),
        "completed_at": "",
    }
    TODOS.append(rec)
    cache.delete(_TODOS_KEY)
    return _todo_dto(rec)


def update_todo(todo_id: str, *, title=None, due=None, done=None) -> dict | None:
    row = TODOS.find(todo_id)
    if not row:
        return None
    rec = {c: row.get(c, "") for c in TODOS.columns}
    if title is not None:
        rec["title"] = title
    if due is not None:
        rec["due"] = due
    if done is not None:
        rec["done"] = "TRUE" if done else "FALSE"
        rec["completed_at"] = _now() if done else ""
    TODOS.update(row["_row"], rec)
    cache.delete(_TODOS_KEY)
    return _todo_dto(rec)


def delete_todo(todo_id: str) -> bool:
    row = TODOS.find(todo_id)
    if not row:
        return False
    TODOS.delete(row["_row"])
    cache.delete(_TODOS_KEY)
    return True


# --- Notes / lists ---------------------------------------------------------
def _item_dto(r: dict) -> dict:
    return {
        "id": r["id"],
        "listId": r.get("list_id", ""),
        "text": r.get("text", ""),
        "checked": _truthy(r.get("checked", "")),
        "createdAt": r.get("created_at", ""),
    }


def _list_dto(r: dict, items: list[dict]) -> dict:
    return {
        "id": r["id"],
        "title": r.get("title", ""),
        "archived": _truthy(r.get("archived", "")),
        "createdAt": r.get("created_at", ""),
        "archivedAt": r.get("archived_at", ""),
        "items": items,
    }


def _bust_notes() -> None:
    cache.delete_many(_NOTES_KEYS)


def list_notes(include_archived: bool = False) -> list[dict]:
    key = "lists:notes:all" if include_archived else "lists:notes:active"
    cached = cache.get(key)
    if cached is not None:
        return cached
    lists = LISTS.read()
    items = ITEMS.read()
    by_list: dict[str, list[dict]] = {}
    for it in items:
        by_list.setdefault(it.get("list_id", ""), []).append(_item_dto(it))
    out = []
    for lst in lists:
        if not include_archived and _truthy(lst.get("archived", "")):
            continue
        its = sorted(by_list.get(lst["id"], []), key=lambda x: x["createdAt"])
        out.append(_list_dto(lst, its))
    out.sort(key=lambda x: x["createdAt"])
    cache.set(key, out, CACHE_TTL)
    return out


def add_list(title: str) -> dict:
    rec = {
        "id": _new_id(),
        "title": title,
        "archived": "FALSE",
        "created_at": _now(),
        "archived_at": "",
    }
    LISTS.append(rec)
    _bust_notes()
    return _list_dto(rec, [])


def update_list(list_id: str, *, title=None, archived=None) -> dict | None:
    row = LISTS.find(list_id)
    if not row:
        return None
    rec = {c: row.get(c, "") for c in LISTS.columns}
    if title is not None:
        rec["title"] = title
    if archived is not None:
        rec["archived"] = "TRUE" if archived else "FALSE"
        rec["archived_at"] = _now() if archived else ""
    LISTS.update(row["_row"], rec)
    _bust_notes()
    items = [_item_dto(r) for r in ITEMS.read() if r.get("list_id") == list_id]
    return _list_dto(rec, sorted(items, key=lambda x: x["createdAt"]))


def delete_list(list_id: str) -> bool:
    row = LISTS.find(list_id)
    if not row:
        return False
    # Remove child items first; delete from the bottom up so row numbers don't shift.
    item_rows = sorted(
        (r["_row"] for r in ITEMS.read() if r.get("list_id") == list_id), reverse=True
    )
    for rn in item_rows:
        ITEMS.delete(rn)
    LISTS.delete(row["_row"])
    _bust_notes()
    return True


def add_item(list_id: str, text: str) -> dict | None:
    if not LISTS.find(list_id):
        return None
    rec = {
        "id": _new_id(),
        "list_id": list_id,
        "text": text,
        "checked": "FALSE",
        "created_at": _now(),
    }
    ITEMS.append(rec)
    _bust_notes()
    return _item_dto(rec)


def update_item(item_id: str, *, text=None, checked=None) -> dict | None:
    row = ITEMS.find(item_id)
    if not row:
        return None
    rec = {c: row.get(c, "") for c in ITEMS.columns}
    if text is not None:
        rec["text"] = text
    if checked is not None:
        rec["checked"] = "TRUE" if checked else "FALSE"
    ITEMS.update(row["_row"], rec)
    _bust_notes()
    return _item_dto(rec)


def delete_item(item_id: str) -> bool:
    row = ITEMS.find(item_id)
    if not row:
        return False
    ITEMS.delete(row["_row"])
    _bust_notes()
    return True
