"""MCP server for the Duvall Family Tools todos & notes.

It's a thin wrapper over the deployed REST API (it holds no data itself), so you
can talk to Claude — "add milk to the groceries list", "what's on my to-do
list?", "mark "call the plumber" done" — and have it edit the same lists the
iPad apps show. Voice comes from the Claude client (dictate on mobile/desktop);
this server just exposes the tools Claude calls.

Configuration (environment variables):
  DFT_BASE_URL   Base URL of the deployed app, e.g. https://duvall-family-tools.onrender.com
                 (defaults to http://localhost:8000 for local testing)
  DFT_TOKEN      The CALENDAR_SHARE_TOKEN secret (sent as the X-Calendar-Token header)
  MCP_TRANSPORT  "stdio" (default; for Claude Desktop) or "http" (Streamable HTTP, for
                 a hosted/mobile-reachable server)
  MCP_HOST/MCP_PORT  bind address for the http transport (default 0.0.0.0:8787)

Run:
  DFT_BASE_URL=… DFT_TOKEN=… python server.py                 # stdio
  MCP_TRANSPORT=http DFT_BASE_URL=… DFT_TOKEN=… python server.py
"""
from __future__ import annotations

import os

import httpx
from mcp.server.fastmcp import FastMCP

BASE_URL = os.environ.get("DFT_BASE_URL", "http://localhost:8000").rstrip("/")
TOKEN = os.environ.get("DFT_TOKEN", "")

mcp = FastMCP("Duvall Family Tools")


def _headers() -> dict[str, str]:
    return {"X-Calendar-Token": TOKEN} if TOKEN else {}


async def _request(method: str, path: str, **kwargs):
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=20) as client:
        resp = await client.request(method, path, headers=_headers(), **kwargs)
        resp.raise_for_status()
        if resp.status_code == 204 or not resp.content:
            return None
        return resp.json()


# --- To-dos ----------------------------------------------------------------
@mcp.tool()
async def list_todos() -> list[dict]:
    """List the family to-dos (open and recently completed) with their ids, titles,
    due dates, and done status."""
    data = await _request("GET", "/api/todos/")
    return data["todos"]


@mcp.tool()
async def add_todo(title: str, due: str = "") -> dict:
    """Add a to-do. `due` is an optional date as YYYY-MM-DD (omit if none)."""
    return await _request("POST", "/api/todos/", json={"title": title, "due": due})


@mcp.tool()
async def complete_todo(todo: str, done: bool = True) -> dict:
    """Mark a to-do done (or not). `todo` may be its id or a case-insensitive
    match on its title."""
    todo_id = await _resolve_todo_id(todo)
    return await _request("PATCH", f"/api/todos/{todo_id}", json={"done": done})


@mcp.tool()
async def delete_todo(todo: str) -> str:
    """Delete a to-do by id or title."""
    todo_id = await _resolve_todo_id(todo)
    await _request("DELETE", f"/api/todos/{todo_id}")
    return f"Deleted to-do {todo_id}."


async def _resolve_todo_id(todo: str) -> str:
    data = await _request("GET", "/api/todos/")
    todos = data["todos"]
    for t in todos:
        if t["id"] == todo:
            return t["id"]
    matches = [t for t in todos if todo.lower() in t["title"].lower()]
    if len(matches) == 1:
        return matches[0]["id"]
    if not matches:
        raise ValueError(f"No to-do matches {todo!r}.")
    raise ValueError(
        "Several to-dos match: " + ", ".join(f"{t['title']!r} ({t['id']})" for t in matches)
    )


# --- Notes / lists ---------------------------------------------------------
@mcp.tool()
async def list_notes(include_archived: bool = False) -> list[dict]:
    """List the notes / shopping lists and their items (ids, text, checked)."""
    path = "/api/notes/lists?archived=1" if include_archived else "/api/notes/lists"
    data = await _request("GET", path)
    return data["lists"]


@mcp.tool()
async def add_list(title: str) -> dict:
    """Create a new note / list (e.g. 'Groceries', 'Packing')."""
    return await _request("POST", "/api/notes/lists", json={"title": title})


@mcp.tool()
async def add_item(list_name: str, item: str) -> dict:
    """Add an item to a list by name (case-insensitive), creating the list if it
    doesn't exist yet. Great for 'add milk to groceries'."""
    data = await _request("GET", "/api/notes/lists")
    match = next(
        (lst for lst in data["lists"] if lst["title"].lower() == list_name.lower()), None
    )
    if match is None:
        match = await _request("POST", "/api/notes/lists", json={"title": list_name})
    return await _request(
        "POST", "/api/notes/items", json={"listId": match["id"], "text": item}
    )


@mcp.tool()
async def check_item(item_id: str, checked: bool = True) -> dict:
    """Check off (or uncheck) an item by its id. Use list_notes to find item ids."""
    return await _request("PATCH", f"/api/notes/items/{item_id}", json={"checked": checked})


@mcp.tool()
async def archive_list(list_name: str, archived: bool = True) -> dict:
    """Archive a finished list by name (or restore it with archived=false)."""
    data = await _request("GET", "/api/notes/lists?archived=1")
    match = next(
        (lst for lst in data["lists"] if lst["title"].lower() == list_name.lower()), None
    )
    if match is None:
        raise ValueError(f"No list named {list_name!r}.")
    return await _request(
        "PATCH", f"/api/notes/lists/{match['id']}", json={"archived": archived}
    )


def main() -> None:
    transport = os.environ.get("MCP_TRANSPORT", "stdio")
    if transport == "http":
        mcp.settings.host = os.environ.get("MCP_HOST", "0.0.0.0")
        mcp.settings.port = int(os.environ.get("MCP_PORT", "8787"))
        mcp.run(transport="streamable-http")
    else:
        mcp.run()


if __name__ == "__main__":
    main()
