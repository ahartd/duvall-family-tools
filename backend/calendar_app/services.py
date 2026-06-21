"""Google Calendar access (read-only, single pre-authorised account).

Rather than persisting OAuth state in a database (Render's free tier has no
durable disk), we reconstruct credentials on demand from environment variables:
the long-lived refresh token plus the OAuth client id/secret. The google-auth
library transparently exchanges the refresh token for a short-lived access
token on the first request.
"""
from __future__ import annotations

import datetime as dt
import logging
from dataclasses import dataclass

from django.conf import settings
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

logger = logging.getLogger(__name__)

CALENDAR_READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.readonly"
# Read + write *events* (not calendar metadata) — enough to mirror dated todos
# onto the calendar. Narrower than the full ``/auth/calendar`` scope.
CALENDAR_WRITE_SCOPE = "https://www.googleapis.com/auth/calendar.events"


class CalendarNotConfigured(RuntimeError):
    """The Google OAuth environment variables are missing."""


class CalendarUnavailable(RuntimeError):
    """Google returned an error we can't recover from."""


@dataclass
class CalendarEvent:
    id: str
    summary: str
    start: str  # ISO 8601 — a date (all-day) or a datetime with offset
    end: str
    all_day: bool
    location: str
    status: str
    html_link: str

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "summary": self.summary,
            "start": self.start,
            "end": self.end,
            "allDay": self.all_day,
            "location": self.location,
            "status": self.status,
            "htmlLink": self.html_link,
        }


def _build_credentials(scopes: list[str] | None = None) -> Credentials:
    missing = [
        name
        for name in (
            "GOOGLE_OAUTH_CLIENT_ID",
            "GOOGLE_OAUTH_CLIENT_SECRET",
            "GOOGLE_REFRESH_TOKEN",
        )
        if not getattr(settings, name)
    ]
    if missing:
        raise CalendarNotConfigured("Missing Google OAuth settings: " + ", ".join(missing))

    # The refresh token's *granted* scopes are fixed at consent time; requesting a
    # subset here is fine. Writes need CALENDAR_WRITE_SCOPE, so the token must have
    # been minted with it (re-run ``manage.py google_auth`` after adding it).
    return Credentials(
        token=None,
        refresh_token=settings.GOOGLE_REFRESH_TOKEN,
        client_id=settings.GOOGLE_OAUTH_CLIENT_ID,
        client_secret=settings.GOOGLE_OAUTH_CLIENT_SECRET,
        token_uri=settings.GOOGLE_TOKEN_URI,
        scopes=scopes or [CALENDAR_READONLY_SCOPE],
    )


def _service(scopes: list[str] | None = None):
    creds = _build_credentials(scopes)
    # cache_discovery=False avoids a warning and a file-cache write that isn't
    # possible on an ephemeral/read-only filesystem.
    return build("calendar", "v3", credentials=creds, cache_discovery=False)


def _parse_endpoint(node: dict) -> tuple[str, bool]:
    """Return ``(iso_string, all_day)`` from a Google start/end node."""
    if "date" in node:  # all-day event
        return node["date"], True
    return node.get("dateTime", ""), False


def _normalize_item(item: dict) -> dict:
    """Map a raw Google event resource to our simplified dict shape."""
    start, all_day = _parse_endpoint(item.get("start", {}))
    end, _ = _parse_endpoint(item.get("end", {}))
    return CalendarEvent(
        id=item.get("id", ""),
        summary=item.get("summary", "(no title)"),
        start=start,
        end=end,
        all_day=all_day,
        location=item.get("location", ""),
        status=item.get("status", ""),
        html_link=item.get("htmlLink", ""),
    ).to_dict()


def list_events(
    time_min: dt.datetime, time_max: dt.datetime, max_results: int = 250
) -> list[dict]:
    """Return simplified events between two timezone-aware instants."""
    service = _service()
    try:
        response = (
            service.events()
            .list(
                calendarId=settings.GOOGLE_CALENDAR_ID,
                timeMin=time_min.isoformat(),
                timeMax=time_max.isoformat(),
                singleEvents=True,  # expand recurring events into instances
                orderBy="startTime",
                maxResults=max_results,
            )
            .execute()
        )
    except Exception as exc:  # google client raises a variety of error types
        logger.exception("Google Calendar request failed")
        raise CalendarUnavailable(str(exc)) from exc

    return [
        _normalize_item(item)
        for item in response.get("items", [])
        if item.get("status") != "cancelled"
    ]


# --- Writing events ---------------------------------------------------------
def _all_day_body(summary: str, due: str) -> dict:
    """An all-day event body for a ``YYYY-MM-DD`` date.

    Google treats ``end.date`` as *exclusive*, so a single-day event ends on the
    following day. Raises ValueError if ``due`` isn't a valid date.
    """
    day = dt.date.fromisoformat(due)
    return {
        "summary": summary,
        "start": {"date": day.isoformat()},
        "end": {"date": (day + dt.timedelta(days=1)).isoformat()},
    }


def _execute_insert(body: dict) -> dict:
    """Insert an event resource; return it in our simplified dict shape."""
    service = _service([CALENDAR_WRITE_SCOPE])
    try:
        created = (
            service.events()
            .insert(calendarId=settings.GOOGLE_CALENDAR_ID, body=body)
            .execute()
        )
    except Exception as exc:  # google client raises a variety of error types
        logger.exception("Google Calendar event insert failed")
        raise CalendarUnavailable(str(exc)) from exc
    return _normalize_item(created)


def create_event(summary: str, due: str) -> str:
    """Create an all-day event (used by the todos mirror); return its event id."""
    return _execute_insert(_all_day_body(summary, due)).get("id", "")


def insert_event(
    summary: str,
    *,
    all_day: bool,
    date: str = "",
    start: str = "",
    end: str = "",
    time_zone: str = "",
    location: str = "",
) -> dict:
    """Create a calendar event from explicit fields; return the created event.

    All-day events use ``date`` (``YYYY-MM-DD``). Timed events use ``start``/
    ``end`` as local ISO datetimes (``YYYY-MM-DDTHH:MM[:SS]``, no offset) plus an
    IANA ``time_zone`` so Google anchors them correctly (DST-safe). Raises
    ValueError on malformed dates/times (the view turns that into a 400).
    """
    if all_day:
        body = _all_day_body(summary, date)
    else:
        tz = time_zone or settings.TIME_ZONE
        # fromisoformat validates the shape; we send the raw string + timeZone.
        dt.datetime.fromisoformat(start)
        dt.datetime.fromisoformat(end)
        body = {
            "summary": summary,
            "start": {"dateTime": start, "timeZone": tz},
            "end": {"dateTime": end, "timeZone": tz},
        }
    if location:
        body["location"] = location
    return _execute_insert(body)


def update_event(event_id: str, summary: str, due: str) -> None:
    """Repoint/retitle an existing all-day event (PATCH leaves other fields)."""
    service = _service([CALENDAR_WRITE_SCOPE])
    try:
        service.events().patch(
            calendarId=settings.GOOGLE_CALENDAR_ID,
            eventId=event_id,
            body=_all_day_body(summary, due),
        ).execute()
    except Exception as exc:
        logger.exception("Google Calendar event patch failed")
        raise CalendarUnavailable(str(exc)) from exc


def delete_event(event_id: str) -> None:
    """Delete an event. A 410 (already gone) is treated as success."""
    service = _service([CALENDAR_WRITE_SCOPE])
    try:
        service.events().delete(
            calendarId=settings.GOOGLE_CALENDAR_ID, eventId=event_id
        ).execute()
    except Exception as exc:
        # Already-deleted events come back as 410 Gone — that's the desired state.
        if getattr(getattr(exc, "resp", None), "status", None) == 410:
            return
        logger.exception("Google Calendar event delete failed")
        raise CalendarUnavailable(str(exc)) from exc
