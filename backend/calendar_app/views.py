import datetime as dt

from django.core.cache import cache
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .services import CalendarNotConfigured, CalendarUnavailable, list_events

# A short cache so a wall display polling every minute doesn't hammer the Google
# API and responses stay snappy. The free plan runs one instance, so local
# memory is fine.
CACHE_TTL_SECONDS = 60
MAX_WINDOW_DAYS = 120

# Event reads are cached per time-window. A write can't enumerate every cached
# window to delete, so caches embed a "generation" that a write bumps — making
# all prior event caches miss at once without touching unrelated caches.
EVENTS_VERSION_KEY = "events:ver"


def _events_version() -> int:
    return cache.get(EVENTS_VERSION_KEY, 0)


def _bump_events_version() -> None:
    try:
        cache.incr(EVENTS_VERSION_KEY)
    except ValueError:  # key absent/expired — start a fresh generation
        cache.set(EVENTS_VERSION_KEY, 1)


def _parse_dt(value: str, default: dt.datetime) -> dt.datetime:
    if not value:
        return default
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return default
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed


def _str(data, key) -> str:
    value = data.get(key)
    return value.strip() if isinstance(value, str) else ""


class EventsView(APIView):
    """GET  /api/calendar/events?timeMin=<iso>&timeMax=<iso> — list events.
    POST /api/calendar/events — create an event (all-day or timed).

    Both are gated by the shared calendar token (the default DRF permission).
    """

    def get(self, request):
        # Quantise the default "now" to the top of the hour so requests that omit
        # timeMin still share a stable cache key (and therefore hit the cache).
        now = dt.datetime.now(dt.timezone.utc).replace(minute=0, second=0, microsecond=0)
        time_min = _parse_dt(request.query_params.get("timeMin", ""), now)
        time_max = _parse_dt(
            request.query_params.get("timeMax", ""), time_min + dt.timedelta(days=42)
        )

        # Clamp the window so a malformed request can't ask Google for years.
        if time_max <= time_min:
            time_max = time_min + dt.timedelta(days=42)
        if (time_max - time_min) > dt.timedelta(days=MAX_WINDOW_DAYS):
            time_max = time_min + dt.timedelta(days=MAX_WINDOW_DAYS)

        cache_key = f"events:{_events_version()}:{time_min.isoformat()}:{time_max.isoformat()}"
        payload = cache.get(cache_key)
        if payload is None:
            try:
                events = list_events(time_min, time_max)
            except CalendarNotConfigured as exc:
                return Response({"detail": str(exc)}, status=503)
            except CalendarUnavailable:
                # The detail is logged server-side (services.logger.exception);
                # don't echo raw upstream errors back to the client.
                return Response(
                    {"detail": "Calendar temporarily unavailable."}, status=502
                )
            payload = {
                "events": events,
                "timeMin": time_min.isoformat(),
                "timeMax": time_max.isoformat(),
            }
            cache.set(cache_key, payload, CACHE_TTL_SECONDS)
        return Response(payload)

    def post(self, request):
        data = request.data
        summary = _str(data, "summary")
        if not summary:
            return Response({"detail": "A title is required."}, status=400)

        all_day = bool(data.get("allDay"))
        fields = {"summary": summary, "all_day": all_day, "location": _str(data, "location")}

        if all_day:
            date = _str(data, "date")
            if not _is_date(date):
                return Response(
                    {"detail": "A valid date (YYYY-MM-DD) is required."}, status=400
                )
            fields["date"] = date
        else:
            start, end = _str(data, "start"), _str(data, "end")
            start_dt, end_dt = _to_local(start), _to_local(end)
            if not start_dt or not end_dt:
                return Response(
                    {"detail": "Valid start and end times are required."}, status=400
                )
            if end_dt <= start_dt:
                return Response(
                    {"detail": "The end time must be after the start time."}, status=400
                )
            fields["start"], fields["end"] = start, end
            fields["time_zone"] = _str(data, "timeZone")

        try:
            event = services.insert_event(**fields)
        except CalendarNotConfigured as exc:
            return Response({"detail": str(exc)}, status=503)
        except CalendarUnavailable:
            return Response({"detail": "Calendar temporarily unavailable."}, status=502)
        except ValueError:
            return Response({"detail": "Invalid date or time."}, status=400)

        _bump_events_version()  # so the next read includes the new event immediately
        return Response(event, status=201)


def _is_date(value: str) -> bool:
    try:
        dt.date.fromisoformat(value)
        return True
    except ValueError:
        return False


def _to_local(value: str) -> dt.datetime | None:
    """Parse a local ISO datetime (no offset) for ordering checks; None if bad."""
    try:
        return dt.datetime.fromisoformat(value)
    except ValueError:
        return None
