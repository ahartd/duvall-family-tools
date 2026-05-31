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


def _build_credentials() -> Credentials:
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

    return Credentials(
        token=None,
        refresh_token=settings.GOOGLE_REFRESH_TOKEN,
        client_id=settings.GOOGLE_OAUTH_CLIENT_ID,
        client_secret=settings.GOOGLE_OAUTH_CLIENT_SECRET,
        token_uri=settings.GOOGLE_TOKEN_URI,
        scopes=[CALENDAR_READONLY_SCOPE],
    )


def _service():
    creds = _build_credentials()
    # cache_discovery=False avoids a warning and a file-cache write that isn't
    # possible on an ephemeral/read-only filesystem.
    return build("calendar", "v3", credentials=creds, cache_discovery=False)


def _parse_endpoint(node: dict) -> tuple[str, bool]:
    """Return ``(iso_string, all_day)`` from a Google start/end node."""
    if "date" in node:  # all-day event
        return node["date"], True
    return node.get("dateTime", ""), False


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

    events: list[dict] = []
    for item in response.get("items", []):
        if item.get("status") == "cancelled":
            continue
        start, all_day = _parse_endpoint(item.get("start", {}))
        end, _ = _parse_endpoint(item.get("end", {}))
        events.append(
            CalendarEvent(
                id=item.get("id", ""),
                summary=item.get("summary", "(no title)"),
                start=start,
                end=end,
                all_day=all_day,
                location=item.get("location", ""),
                status=item.get("status", ""),
                html_link=item.get("htmlLink", ""),
            ).to_dict()
        )
    return events
