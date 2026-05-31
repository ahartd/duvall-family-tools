# Duvall Family Tools

A small **platform** for family productivity tools: one Django REST API backend
that also serves a family of independent ("micro") React apps. The first tool is
a **Family Calendar** designed to live full-screen on a wall-mounted iPad,
showing events from a single linked Google Calendar.

It's built to **extend**: adding a second tool is a new React app folder plus a
Django app and one URL line — the shared plumbing (auth, static serving,
deployment) is already in place.

---

## Architecture at a glance

```
duvall-family-tools/
├── backend/                 # Django 6 + DRF API (and serves the built React apps)
│   ├── config/              #   project: settings / urls / wsgi
│   ├── core/                #   shared platform code: secret-link auth, health, app-index view
│   ├── calendar_app/        #   the Calendar tool: Google integration + /api/calendar/events
│   │   └── management/commands/google_auth.py   # one-time OAuth helper
│   └── requirements.txt
├── frontend/                # npm-workspaces monorepo of React + TS micro-apps
│   ├── package.json         #   workspaces: apps/*, packages/*
│   └── apps/calendar/       #   the Calendar SPA (Vite + React 19 + TypeScript)
├── Dockerfile               # multi-stage: Node builds the frontend, Python runs it
└── render.yaml              # Render Blueprint (one free web service)
```

**How one service serves many apps:** each Vite app builds with
`base: '/static/<app>/'` into `frontend/dist/<app>/`. Django's `collectstatic`
sweeps that into `STATIC_ROOT`; **WhiteNoise** serves the content-hashed JS/CSS
at `/static/<app>/…`, and a tiny view (`core.views.app_index`) returns the built
`index.html` for the clean `/<app>/` URL. No `django-vite`, no manifest parsing.

**Why it's effectively stateless:** because only one Google account is linked,
the credential is a single refresh token stored as an **environment variable**
(not in a database). That sidesteps Render's free tier having no persistent disk
and a Postgres database that expires after 30 days. SQLite is used by default and
holds nothing critical; set `DATABASE_URL` later if a tool needs real persistence.

---

## Tech stack

| Layer | Choice | Version (pinned) |
|---|---|---|
| Backend | Django + Django REST Framework | 6.0.5 / 3.17.1 |
| Server | Gunicorn + WhiteNoise | 26.0.0 / 6.12.0 |
| Google | google-api-python-client / -auth / -oauthlib | 2.197 / 2.53 / 1.4 |
| Frontend | React + TypeScript + Vite | 19 / 6 / 8 |
| Runtime | Python / Node (in Docker) | 3.14 / 20 |
| Hosting | Render (free web service, Docker) | — |

---

## Local development

You run two dev servers: Django for the API, and Vite for the React app (with
hot-reload). Vite proxies `/api` → Django, so the app calls relative URLs in both
dev and production.

### 1. Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then fill in values (see below)
python manage.py migrate
python manage.py runserver    # API at http://localhost:8000
```

For local dev you can leave `CALENDAR_SHARE_TOKEN` empty — the API allows access
when `DJANGO_DEBUG=true` and no token is configured. To see *real* events you
still need the Google credentials (next section).

### 2. Frontend

```bash
cd frontend
npm install
npm run dev:calendar          # Vite at http://localhost:5173
```

Open **http://localhost:5173**. Edits hot-reload. (The Django `/calendar/` route
is for production/built assets; in dev you use the Vite server.)

---

## Connecting your Google Calendar (one-time)

The app reads one calendar, read-only, via OAuth2. You do a one-time browser
authorization locally; the resulting **refresh token** is then stored as an env
var. Sourced from official Google docs (see links at the bottom).

### A. Google Cloud setup

1. Go to <https://console.cloud.google.com> and **create/select a project**.
2. **Enable the Calendar API:** *APIs & Services → Library →* search
   "**Google Calendar API**" → **Enable**.
3. **Configure the OAuth consent screen** (*APIs & Services → OAuth consent
   screen*, now "Google Auth Platform"):
   - **Branding:** app name + your email as support/developer contact.
   - **Audience:** **User type = External** (required for a personal `@gmail.com`).
   - **Data Access:** add the scope
     `https://www.googleapis.com/auth/calendar.readonly` (the Console marks it
     **sensitive** — that's expected, not restricted).
   - **Publishing status:** ⚠️ **Click "Publish app" → In production.** This is
     important: apps left in **Testing** issue refresh tokens that **expire after
     7 days**, which would silently break the calendar weekly. In production the
     token is long-lived.
4. **Create credentials:** *APIs & Services → Credentials → Create credentials →
   OAuth client ID →* **Application type = Desktop app** → Create. Copy the
   **Client ID** and **Client secret** (or *Download JSON*).

> Because the app is unverified and uses a sensitive scope, the first time you
> authorize you'll see a **"Google hasn't verified this app"** screen. Click
> **Advanced → Go to {app} (unsafe)**. This is fine for personal use (the
> unverified-app limit is 100 users; you'll use 1).

### B. Get the refresh token

Put the client id/secret in `backend/.env`:

```ini
GOOGLE_OAUTH_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=yyyy
```

Then run the helper (it opens your browser):

```bash
cd backend && source .venv/bin/activate
python manage.py google_auth
```

Approve access. The command prints:

```
GOOGLE_REFRESH_TOKEN=1//0g....
```

Add that line to `backend/.env` (for local) and to Render's environment (for
production). That's it — the app rebuilds credentials from the client id/secret +
refresh token on each request and auto-refreshes the short-lived access token.

To read a **non-primary** calendar, set `GOOGLE_CALENDAR_ID` to that calendar's
ID (Google Calendar → calendar settings → "Integrate calendar" → Calendar ID).

---

## The "secret link"

Calendar access is gated by an unguessable token (`CALENDAR_SHARE_TOKEN`) — no
login screen. The calendar URL is:

```
https://<your-app>.onrender.com/calendar/?token=<CALENDAR_SHARE_TOKEN>
```

On load the app caches the token in `localStorage` and **keeps it in the URL** so
that an iOS "Add to Home Screen" bookmark still carries it — a standalone
home-screen web app gets its own storage and can't see Safari's `localStorage`,
so the URL is the only reliable carrier across that boundary. In standalone
(kiosk) mode there's no visible address bar, so the secret isn't shown on the
wall. The token is sent to the API only as an `X-Calendar-Token` header (never a
query param, so it stays out of server logs), checked with a constant-time compare.

Generate a token locally with:
`python -c "import secrets; print(secrets.token_urlsafe(32))"` (or let Render
generate it — see below).

---

## Deploying to Render (free)

Render builds and runs the `Dockerfile`, so the deployed Python version matches
local exactly. One free **web service** serves both the API and the React apps.

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, select the repo. Render reads `render.yaml`.
3. Render auto-generates `DJANGO_SECRET_KEY` and `CALENDAR_SHARE_TOKEN`. Fill in
   the three Google values (`GOOGLE_OAUTH_CLIENT_ID`, `…_SECRET`,
   `…_REFRESH_TOKEN`) when prompted (they're marked `sync: false`).
4. Deploy. The health check at `/healthz` confirms it's up.
5. In the dashboard, open the service → **Environment** → copy the generated
   `CALENDAR_SHARE_TOKEN`, and build your secret link (above).

### Free-plan behavior (good to know)

- **750 instance-hours/month per workspace** (shared across all your free
  services). One always-on service = ~720 h, which fits — but a *second*
  always-on free service would blow the budget.
- **Spins down after 15 min idle**; the next request takes **~1 minute** to wake.
  Fine for a wall calendar. To keep it warm during the day, an external uptime
  monitor (e.g. UptimeRobot) hitting `/healthz` every 5 min works in practice.
  *(Note: Render doesn't officially document keep-alive pingers — it's a common
  community practice, not a sanctioned feature.)*
- **No persistent disk; free Postgres expires after 30 days.** This app stores
  nothing critical, so neither matters — but don't put real data in the default
  SQLite expecting it to survive redeploys.

### Test the production image locally (optional)

```bash
docker build -t duvall-family-tools .
docker run --rm -p 10000:10000 \
  -e DJANGO_SECRET_KEY=local-test \
  -e CALENDAR_SHARE_TOKEN=local-test \
  -e GOOGLE_OAUTH_CLIENT_ID=… -e GOOGLE_OAUTH_CLIENT_SECRET=… -e GOOGLE_REFRESH_TOKEN=… \
  duvall-family-tools
# open http://localhost:10000/calendar/?token=local-test
```

---

## iPad kiosk setup

1. Open the **full** secret link (`…/calendar/?token=…`) in **Safari** on the iPad.
2. **Share → Add to Home Screen**, then launch the app from the new icon. The
   token rides in the bookmarked URL on purpose: iOS gives a standalone
   home-screen web app its **own storage**, separate from Safari, so the URL is
   the only thing that reliably carries the secret across (no address bar is
   shown in standalone mode, so it isn't visible on the wall).
3. Settings → Display & Brightness → **Auto-Lock = Never**, keep it on a charger,
   and optionally use **Guided Access** to lock the iPad to this one app.

On the wall it looks after itself:

- Events refresh every 5 minutes; the clock and "today" highlight tick
  continuously; it re-fetches the instant the screen wakes.
- It re-centers on the current month/week after ~10 minutes idle (so it rolls
  over at midnight and month boundaries on its own), and reloads daily at 4am to
  pick up anything you deploy. Use the **Month / Week / Agenda** toggle to switch
  views; Month is the default.

> **Seeing "A valid calendar access token is required"?** The home-screen icon
> was saved without the token. Delete the icon, open a fresh `…/calendar/?token=…`
> link in Safari, and **Add to Home Screen** again (this needs the deployed app
> to include the fix that keeps the token in the URL).

---

## Adding a new tool later

1. **Frontend:** `frontend/apps/<tool>/` — copy the calendar app's `package.json`,
   `vite.config.ts` (change `base` to `/static/<tool>/` and `outDir` to
   `../../dist/<tool>`), `tsconfig.json`, and `index.html`; build your React app.
2. **Backend:** create a Django app (e.g. `python manage.py startapp <tool>`),
   add it to `INSTALLED_APPS`, expose an API under `api/<tool>/`.
3. **Routing:** in `backend/config/urls.py` add
   `path("<tool>/", core_views.app_index, {"app_name": "<tool>"})` and include the
   API urls.
4. It deploys automatically — the Dockerfile builds every workspace and
   `collectstatic` picks up the new app.

The shared `HasCalendarToken` permission, health check, static serving, and
Docker/Render pipeline all apply with no changes.

---

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DJANGO_DEBUG` | – | `true` locally, `false` (default) in production |
| `DJANGO_SECRET_KEY` | prod | required when DEBUG is false; Render generates it |
| `CALENDAR_SHARE_TOKEN` | prod | the secret-link token; Render generates it |
| `GOOGLE_OAUTH_CLIENT_ID` | yes | from the Desktop-app OAuth client |
| `GOOGLE_OAUTH_CLIENT_SECRET` | yes | " |
| `GOOGLE_REFRESH_TOKEN` | yes | from `python manage.py google_auth` |
| `GOOGLE_CALENDAR_ID` | – | defaults to `primary` |
| `DJANGO_ALLOWED_HOSTS` | – | auto-includes `.onrender.com` on Render |
| `DATABASE_URL` | – | optional Postgres for future stateful tools |
| `DJANGO_SECURE_SSL_REDIRECT` | – | leave off on Render (edge already redirects) |

---

## Sources

Render free plan: <https://render.com/docs/free> · Blueprint spec:
<https://render.com/docs/blueprint-spec>. Google OAuth refresh-token expiry &
publishing: <https://developers.google.com/identity/protocols/oauth2> ·
verification not needed for personal use:
<https://support.google.com/cloud/answer/13464323> · Desktop-app/loopback flow:
<https://developers.google.com/identity/protocols/oauth2/native-app>.
