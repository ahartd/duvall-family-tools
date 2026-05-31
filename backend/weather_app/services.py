"""Weather via Open-Meteo (https://open-meteo.com) — free, no API key.

Called server-side so the location lives in env vars (not the static bundle) and
responses can be cached. Uses stdlib urllib to avoid adding a dependency.
"""
from __future__ import annotations

import json
import logging
import urllib.parse
import urllib.request

from django.conf import settings

logger = logging.getLogger(__name__)

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


class WeatherNotConfigured(RuntimeError):
    """WEATHER_LATITUDE / WEATHER_LONGITUDE are not set."""


class WeatherUnavailable(RuntimeError):
    """Open-Meteo returned an error we can't recover from."""


def _at(daily: dict, key: str, i: int):
    values = daily.get(key) or []
    return values[i] if i < len(values) else None


def get_forecast() -> dict:
    lat = settings.WEATHER_LATITUDE
    lon = settings.WEATHER_LONGITUDE
    if not lat or not lon:
        raise WeatherNotConfigured(
            "Set WEATHER_LATITUDE and WEATHER_LONGITUDE to enable weather."
        )

    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,apparent_temperature,weather_code,is_day",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        "timezone": "auto",
        "forecast_days": 7,
        "temperature_unit": settings.WEATHER_TEMPERATURE_UNIT,
        "precipitation_unit": "inch",
        "wind_speed_unit": "mph",
    }
    url = f"{OPEN_METEO_URL}?{urllib.parse.urlencode(params)}"
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "duvall-family-tools"})
        with urllib.request.urlopen(request, timeout=10) as resp:
            data = json.loads(resp.read())
    except Exception as exc:  # network / HTTP / JSON errors
        logger.exception("Open-Meteo request failed")
        raise WeatherUnavailable(str(exc)) from exc

    current = data.get("current", {})
    daily = data.get("daily", {})
    days = [
        {
            "date": date,
            "code": _at(daily, "weather_code", i),
            "max": _at(daily, "temperature_2m_max", i),
            "min": _at(daily, "temperature_2m_min", i),
            "precipProb": _at(daily, "precipitation_probability_max", i),
        }
        for i, date in enumerate(daily.get("time", []))
    ]
    return {
        "current": {
            "temp": current.get("temperature_2m"),
            "feelsLike": current.get("apparent_temperature"),
            "code": current.get("weather_code"),
            "isDay": bool(current.get("is_day", 1)),
        },
        "daily": days,
        "unit": settings.WEATHER_TEMPERATURE_UNIT,
        "timezone": data.get("timezone", ""),
    }
