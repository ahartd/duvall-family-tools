from django.contrib.staticfiles import finders
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_GET


@require_GET
def healthz(request):
    """Cheap liveness probe (no DB hit) for Render health checks and uptime pings."""
    return JsonResponse({"status": "ok"})


@require_GET
def home(request):
    """Landing page listing the available tools."""
    tools = [
        {
            "name": "Family Dashboard",
            "path": "/dashboard/",
            "icon": "🏠",
            "description": "At-a-glance clock, weather, and today's agenda for the wall display.",
        },
        {
            "name": "Family Calendar",
            "path": "/calendar/",
            "icon": "📅",
            "description": "Shared Google Calendar, optimised for an iPad wall display.",
        },
        {
            "name": "Family Recipes",
            "path": "/recipes/",
            "icon": "🍳",
            "description": "Dinner ideas and a searchable library of our favourite recipes.",
        },
    ]
    # Carry the secret-link token through to each app, so opening the launcher
    # via /?token=… keeps the kiosk authenticated as it hops between tools.
    token = request.GET.get("token", "")
    return render(request, "home.html", {"tools": tools, "token": token})


@require_GET
def app_index(request, app_name):
    """Serve a built micro-app's ``index.html``.

    Vite builds each app to ``frontend/dist/<app>/index.html`` with asset URLs
    rooted at ``/static/<app>/``. We resolve the file through the staticfiles
    finders so it works in development (via STATICFILES_DIRS) and in production
    (via STATIC_ROOT after collectstatic) alike.
    """
    result = finders.find(f"{app_name}/index.html")
    if result is None:
        message = (
            f"The '{app_name}' app has not been built yet.\n\n"
            "For local development, run the Vite dev server:\n"
            f"    cd frontend/apps/{app_name} && npm run dev\n\n"
            "For a production build:\n"
            "    npm --prefix frontend run build\n"
            "    python backend/manage.py collectstatic --noinput\n"
        )
        return HttpResponse(message, content_type="text/plain", status=503)
    with open(result, "rb") as fh:
        return HttpResponse(fh.read(), content_type="text/html")
