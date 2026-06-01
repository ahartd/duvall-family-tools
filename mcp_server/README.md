# Duvall Family Tools — MCP server

A small [MCP](https://modelcontextprotocol.io) server that lets Claude read and
edit your **to-dos** and **notes/shopping lists** by talking to the deployed
app's REST API. Dictate to Claude on your phone or laptop — *"add eggs and milk
to the groceries list"*, *"what's on my to-do list?"*, *"mark 'call the plumber'
done"* — and it updates the same lists the iPad apps show.

It stores nothing itself; it's a thin wrapper over `/api/todos` and `/api/notes`.

## Tools

| Tool | What it does |
|------|--------------|
| `list_todos` | List to-dos (open + recently done) |
| `add_todo(title, due="")` | Add a to-do, optional `YYYY-MM-DD` due date |
| `complete_todo(todo, done=True)` | Complete/reopen a to-do by id **or title** |
| `delete_todo(todo)` | Delete a to-do by id or title |
| `list_notes(include_archived=False)` | List notes/lists and their items |
| `add_list(title)` | Create a list |
| `add_item(list_name, item)` | Add an item to a named list (creates it if missing) |
| `check_item(item_id, checked=True)` | Check/uncheck an item |
| `archive_list(list_name, archived=True)` | Archive/restore a finished list |

## Prerequisites

The to-dos/notes API must be working first, which means the deployment has:

- `LISTS_SHEET_ID` set to the backing spreadsheet (the family **"Duvall Family
  Lists"** sheet).
- A `GOOGLE_REFRESH_TOKEN` that includes the **read/write Sheets** scope — re-run
  `python backend/manage.py google_auth` once (it now requests Calendar-read +
  Sheets-write) and paste the new token into your env.

## Configuration

| Env var | Meaning |
|---------|---------|
| `DFT_BASE_URL` | Base URL of the app, e.g. `https://duvall-family-tools.onrender.com` (default `http://localhost:8000`) |
| `DFT_TOKEN` | The `CALENDAR_SHARE_TOKEN` secret (sent as `X-Calendar-Token`) |
| `MCP_TRANSPORT` | `stdio` (default) or `http` |
| `MCP_HOST` / `MCP_PORT` | bind for `http` transport (default `0.0.0.0:8787`) |

```bash
python -m venv .venv && .venv/bin/pip install -r requirements.txt
```

## Use it from Claude Desktop (local, stdio)

Add to your Claude Desktop MCP config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "family-tools": {
      "command": "/absolute/path/to/mcp_server/.venv/bin/python",
      "args": ["/absolute/path/to/mcp_server/server.py"],
      "env": {
        "DFT_BASE_URL": "https://duvall-family-tools.onrender.com",
        "DFT_TOKEN": "your-CALENDAR_SHARE_TOKEN"
      }
    }
  }
}
```

Restart Claude Desktop, then dictate your request. Voice is just Claude's
built-in dictation — the MCP server only supplies the tools.

## Use it from mobile / a hosted server (Streamable HTTP)

To reach it from the Claude mobile app, run it as a remote server and add it as a
custom connector:

```bash
MCP_TRANSPORT=http DFT_BASE_URL=https://duvall-family-tools.onrender.com \
  DFT_TOKEN=your-token .venv/bin/python server.py
# serves MCP at http://<host>:8787/mcp
```

Put it behind HTTPS (e.g. a second small Render/Fly service, or any host you
control) and add that URL as a connector. Protect it — anyone who can reach it
can edit your lists; the `DFT_TOKEN` gates the underlying API but the MCP
endpoint itself should be private (HTTPS + a hard-to-guess URL or auth proxy).
