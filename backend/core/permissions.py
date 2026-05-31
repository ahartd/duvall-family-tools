import hashlib
import logging
import secrets

from django.conf import settings
from rest_framework.permissions import BasePermission

logger = logging.getLogger(__name__)


class HasCalendarToken(BasePermission):
    """Gate API access behind a shared secret token (the "secret link").

    The token may arrive either as an ``X-Calendar-Token`` header or a ``token``
    query parameter — the query parameter is what lets a single bookmarked URL
    deliver the secret to a kiosk iPad on first load. Both sides are hashed
    before comparison, so the time taken is independent of the token length.

    If no token is configured, access is allowed only in DEBUG (so local dev is
    frictionless) and denied otherwise (fail closed).
    """

    message = "A valid calendar access token is required."

    def has_permission(self, request, view):
        configured = settings.CALENDAR_SHARE_TOKEN
        if not configured:
            if settings.DEBUG:
                return True
            logger.warning("CALENDAR_SHARE_TOKEN is not set; denying API access.")
            return False

        provided = request.headers.get("X-Calendar-Token") or request.query_params.get(
            "token", ""
        )
        if not provided:
            return False
        # Hash both sides so comparison time doesn't reveal the token's length.
        return secrets.compare_digest(
            hashlib.sha256(provided.encode()).digest(),
            hashlib.sha256(configured.encode()).digest(),
        )
