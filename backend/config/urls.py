"""Root URL configuration.

Routing model for the platform:
  /                     -> simple landing page listing the tools
  /healthz              -> cheap liveness probe (Render health check / uptime ping)
  /api/<tool>/...       -> JSON APIs, gated by the secret-link token
  /<tool>/              -> serves that micro-app's built index.html (React SPA)
  /static/<tool>/...    -> hashed JS/CSS assets, served by WhiteNoise
"""
from django.contrib import admin
from django.urls import include, path

from core import views as core_views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("healthz", core_views.healthz, name="healthz"),
    path("", core_views.home, name="home"),
    # APIs
    path("api/calendar/", include("calendar_app.urls")),
    # Micro-app shells (add a line here as you add apps)
    path("calendar/", core_views.app_index, {"app_name": "calendar"}, name="calendar-app"),
]
