from django.core.cache import cache
from rest_framework.response import Response
from rest_framework.views import APIView

from .services import WeatherNotConfigured, WeatherUnavailable, get_forecast

CACHE_TTL_SECONDS = 15 * 60  # Open-Meteo updates roughly hourly


class WeatherView(APIView):
    """GET /api/weather/ — current conditions + a 7-day forecast (cached 15 min)."""

    def get(self, request):
        payload = cache.get("weather")
        if payload is None:
            try:
                payload = get_forecast()
            except WeatherNotConfigured as exc:
                return Response({"detail": str(exc)}, status=503)
            except WeatherUnavailable:
                return Response({"detail": "Weather temporarily unavailable."}, status=502)
            cache.set("weather", payload, CACHE_TTL_SECONDS)
        return Response(payload)
