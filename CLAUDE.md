# CLAUDE.md

Guidance for working in this repo. For **setup/deploy** instructions (Google OAuth,
Render, iPad kiosk), see [README.md](README.md).

## What this is
A platform of family productivity tools: one **Django 6 + DRF** backend that also
serves multiple independent **React (Vite + TypeScript) micro-apps**, deployed as a
**single Docker web service on Render's free plan**. First tool: an iPad wall
calendar reading one Google Calendar.

## Layout
- `backend/` — Django. `config/` (settings/urls/wsgi), `core/` (shared: secret-link
  auth, `/healthz`, the generic "serve a built app" view, the `google_sheets.py`
  Sheets datastore), `calendar_app/` (the Google Calendar tool + the `google_auth`
  management command), `lists_app/` (todos + notes API, Sheets-backed).
- `frontend/` — npm-workspaces monorepo. Apps so far: `apps/calendar/` (Google
  Calendar SPA), `apps/dashboard/` (clock + weather + today's agenda wall display),
  `apps/recipes/` (dinner ideas + searchable recipe library), `apps/todos/` (shared
  to-do list w/ due dates), `apps/notes/` (shopping lists / notes you check off and
  archive). Add tools under `apps/<tool>/`. Every app renders a shared
  `components/AppNav.tsx` (a copy per app) — the slim top bar that switches between
  tools and carries the `?token`.
- `mcp_server/` — a thin MCP server (over the REST API) so Claude can add/edit
  todos & list items by voice. Holds no data of its own.
- `Dockerfile` (multi-stage: Node builds frontend → Python runs it), `render.yaml`
  (Render blueprint).

## Commands
Backend — run from the repo root; `PYTHONPATH=backend` makes the `config`/`core`/
`calendar_app` packages importable without `cd`:
- Dev server: `DJANGO_DEBUG=true PYTHONPATH=backend backend/.venv/bin/python backend/manage.py runserver`
- Check / migrate: `… backend/manage.py check` · `… migrate`
- Get a Google refresh token: `… backend/manage.py google_auth`
- Collect static (after a frontend build): `… backend/manage.py collectstatic --noinput`

Frontend — workspace commands from the repo root:
- Dev (HMR, proxies `/api` → `:8000`): `npm --prefix frontend run dev:calendar` (or
  `dev:dashboard` / `dev:recipes`) → http://localhost:5173
- Build all apps: `npm --prefix frontend run build` → `frontend/dist/<app>/`

Recipes data — the recipes app ships a **baked snapshot** of the family "Recipes
to try" Google Sheet (no runtime Google call, no extra OAuth scope). To refresh:
re-export the sheet to `frontend/apps/recipes/data/source.md`, then run
`python frontend/apps/recipes/data/build_data.py` (rewrites `src/data/recipes.json`)
and rebuild. See that script's docstring for the export format.

Todos / Notes storage — these are the only **stateful** tools, so they persist in
a Google Sheet (`LISTS_SHEET_ID`) rather than the ephemeral SQLite DB. Tabs:
`Todos`, `Lists`, `Items` (auto-created on first write). This needs the refresh
token to carry the **read/write Sheets scope** *and* the **Calendar-events write
scope** (see next paragraph), so after changing scopes you must re-run
`manage.py google_auth` (now requests Calendar read + Calendar-events write +
Sheets write) and update `GOOGLE_REFRESH_TOKEN`. `core/google_sheets.py:SheetTable`
is the row-per-record helper; `lists_app/store.py` is the todos/notes logic
(cached ~8s, busted on write).

Todos ↔ Calendar mirror — a todo with a `due` date is reflected onto the Google
Calendar as an **all-day event** (so it shows on the wall display). The link is
the `event_id` column on the `Todos` tab: `lists_app/store.py:_sync_event`
creates/patches/deletes the event as the todo's title/date changes, and
`delete_todo` removes it; **completing** a todo leaves its event in place. The
write side lives in `calendar_app/services.py` (`create_event`/`update_event`/
`delete_event`, via `CALENDAR_WRITE_SCOPE`) and is **best-effort** — a Calendar
failure is logged and never blocks the todo write. Sheets created before this
feature get the `event_id` header added once via `store._ensure_todos_schema()`.
(All-day end dates are exclusive in the Calendar API — a one-day event ends the
next day; see `services._all_day_body`.)

Creating events from the calendar UI — the calendar SPA has an "+ Add" button
(and tap-a-day in month/week views) that opens a form for an all-day **or** timed
event. It POSTs to the same `EventsView` (`POST /api/calendar/events`), which
validates and calls `services.insert_event` (reusing `CALENDAR_WRITE_SCOPE` — no
new OAuth). Timed events send a naive local `dateTime` + the device's IANA
`timeZone` (DST-safe; the server doesn't compute offsets). A write bumps an
`events:ver` cache generation (`views._bump_events_version`) so the read cache
doesn't hide the new event; the frontend also inserts it optimistically. The
shared `HasCalendarToken` permission gates the POST automatically.

MCP server (voice) — `mcp_server/server.py` wraps the REST API as MCP tools
(`add_todo`, `add_item`, `complete_todo`, `archive_list`, …). Config via env
`DFT_BASE_URL` + `DFT_TOKEN` (the share token). `MCP_TRANSPORT=stdio` for Claude
Desktop, `=http` (Streamable HTTP) for a mobile-reachable host. Voice input comes
from the Claude client; the server just exposes the tools. See `mcp_server/README.md`.

Production parity: `docker build -t dft . && docker run --rm -p 10000:10000 -e DJANGO_SECRET_KEY=x -e CALENDAR_SHARE_TOKEN=x dft`

## Architecture & conventions
- **Stateless by design.** The single Google account is a `GOOGLE_REFRESH_TOKEN`
  env var (not a DB row); viewing is gated by a `CALENDAR_SHARE_TOKEN` "secret link"
  (`core/permissions.py`, constant-time hash compare). SQLite is the default DB and
  holds nothing critical — Render free has no persistent disk and its free Postgres
  expires after 30 days.
- **One service serves all apps.** Each Vite app builds with `base:/static/<app>/`
  into `frontend/dist/<app>/`; WhiteNoise serves the hashed assets and
  `core.views.app_index` returns the built `index.html` at `/<app>/`.
- **Settings are 12-factor / env-driven** (`backend/config/settings.py` via
  `django-environ`). `DEBUG=false` (prod) requires `DJANGO_SECRET_KEY`. No CORS
  library is needed (same-origin in prod; the Vite dev proxy handles dev).
- **The frontend sends the token as the `X-Calendar-Token` header, never a query
  param** (keeps it out of access logs). The permission accepts either, and fails
  closed when unset (allows only in DEBUG).
- The Django app is named `calendar_app`, not `calendar`, to avoid shadowing
  Python's stdlib `calendar` module.
- Frontend dates: all-day events are floating `YYYY-MM-DD` strings parsed as **local**
  dates (`src/dates.ts:parseAllDay`) — never `new Date(str)`, which is UTC and lands
  on the wrong day in negative-offset timezones. Times render in the device's local tz.

## Adding a tool
1. `frontend/apps/<tool>/` — copy calendar's `vite.config.ts` and set `base` +
   `outDir` to `<tool>`.
2. Create a Django app, add it to `INSTALLED_APPS`, expose an API under `api/<tool>/`.
3. Add `path("<tool>/", core_views.app_index, {"app_name": "<tool>"})` to
   `backend/config/urls.py`.
Shared auth, static serving, the Dockerfile, and Render all work unchanged.

## Gotchas
- Google's OAuth consent screen must be **published ("In production")** or refresh
  tokens expire after 7 days.
- Render: bind `0.0.0.0:$PORT`; leave `SECURE_SSL_REDIRECT` off (Render's edge
  already redirects HTTP→HTTPS; an app-level redirect can 301 internal health checks).
- This dev machine's sandboxed shell lacks `curl`/`head` on PATH — use Python
  `urllib` for HTTP probes and `tail` for file output.

## Verifying changes
- Backend: `… manage.py check`, then spot-check routes with gunicorn + `urllib`.
- Frontend: `npm --prefix frontend run build:calendar` (runs `tsc` then Vite).
- The date/bucketing logic (`src/events.ts`, `src/dates.ts`) is the trickiest part
  and is worth unit-testing (transpile to CJS with the workspace `tsc` and assert).
