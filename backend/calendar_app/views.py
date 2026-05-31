import datetime as dt

from django.core.cache import cache
from rest_framework.response import Response
from rest_framework.views import APIView

from .services import CalendarNotConfigured, CalendarUnavailable, list_events

# A short cache so a wall display polling every minute doesn't hammer the Google
# API and responses stay snappy. The free plan runs one instance, so local
# memory is fine.
CACHE_TTL_SECONDS = 60
MAX_WINDOW_DAYS = 120


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


class EventsView(APIView):
    """GET /api/calendar/events?timeMin=<iso>&timeMax=<iso>

    Returns events between two ISO-8601 instants. The frontend passes the
    visible month's bounds; both default sensibly if omitted.
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

        cache_key = f"events:{time_min.isoformat()}:{time_max.isoformat()}"
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
