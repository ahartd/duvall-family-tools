"""
Django settings for the Duvall Family Tools backend.

A single, environment-driven settings module (12-factor style): behaviour is
controlled entirely by environment variables, so the same code runs locally and
on Render with no changes. See ``backend/.env.example`` for the full list.
"""
import re
from pathlib import Path

import environ
from django.core.exceptions import ImproperlyConfigured

# BASE_DIR is the `backend/` directory; REPO_ROOT is the repository root.
BASE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BASE_DIR.parent

env = environ.Env()

# Load a local .env file if present (never committed). On Render you set real
# environment variables in the dashboard instead.
_env_file = BASE_DIR / ".env"
if _env_file.exists():
    env.read_env(_env_file)

DEBUG = env.bool("DJANGO_DEBUG", default=False)

# --- Security --------------------------------------------------------------
SECRET_KEY = env.str("DJANGO_SECRET_KEY", default="")
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = "django-insecure-dev-key-change-me"  # local only
    else:
        raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set when DEBUG is False.")

ALLOWED_HOSTS = env.list(
    "DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1", "[::1]"]
)
CSRF_TRUSTED_ORIGINS = env.list("DJANGO_CSRF_TRUSTED_ORIGINS", default=[])

# Render injects the public hostname at runtime; trust it automatically.
RENDER_EXTERNAL_HOSTNAME = env.str("RENDER_EXTERNAL_HOSTNAME", default="")
if RENDER_EXTERNAL_HOSTNAME:
    # ALLOWED_HOSTS trusts the onrender.com subdomain broadly so internal health
    # checks (which may not carry the exact public Host) don't trip
    # DisallowedHost — safe here because the API is GET-only and token-gated with
    # no host-dependent flows. CSRF, by contrast, trusts only this exact origin.
    ALLOWED_HOSTS.extend([RENDER_EXTERNAL_HOSTNAME, ".onrender.com"])
    CSRF_TRUSTED_ORIGINS.append(f"https://{RENDER_EXTERNAL_HOSTNAME}")

# --- Applications ----------------------------------------------------------
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "core",
    "calendar_app",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # WhiteNoise serves static files directly from gunicorn (no separate host).
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# --- Database --------------------------------------------------------------
# SQLite by default (v1 stores nothing critical — the calendar feature is
# stateless). Set DATABASE_URL to use Postgres for future stateful tools.
if env.str("DATABASE_URL", default=""):
    DATABASES = {"default": env.db("DATABASE_URL")}
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# --- Internationalisation --------------------------------------------------
# The server stays in UTC; each micro-app renders times in the *device's* local
# timezone (ideal for an iPad on the wall — it shows the right local times).
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# --- Static files (built React apps) ---------------------------------------
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Vite builds each micro-app into `frontend/dist/<app>/`. Only add the path to
# the search list if it exists, so a fresh checkout (before the frontend is
# built) doesn't emit a warning.
_frontend_dist = REPO_ROOT / "frontend" / "dist"
STATICFILES_DIRS = [_frontend_dist] if _frontend_dist.exists() else []

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    # Vite already content-hashes filenames, so we only need compression here
    # (not the manifest/re-hashing storage, which would fight Vite's hashes).
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}
WHITENOISE_AUTOREFRESH = DEBUG  # serve freshly-changed files without a restart in dev


def _whitenoise_immutable(path, url):
    # Vite content-hashes asset filenames (`<name>-<hash>.<ext>`), so those
    # bundles never change and can be cached for a year. Non-hashed files (e.g.
    # Django admin static) don't match and keep the default short max-age.
    return re.search(r"-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$", url) is not None


WHITENOISE_IMMUTABLE_FILE_TEST = _whitenoise_immutable

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Caching ---------------------------------------------------------------
# A short in-memory cache for calendar responses. The free plan runs a single
# instance, so local memory is sufficient and avoids extra services.
CACHES = {
    "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}
}

# --- Django REST Framework -------------------------------------------------
REST_FRAMEWORK = {
    # No user/session auth — access is gated by the shared secret-link token.
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["core.permissions.HasCalendarToken"],
    "DEFAULT_RENDERER_CLASSES": (
        [
            "rest_framework.renderers.JSONRenderer",
            "rest_framework.renderers.BrowsableAPIRenderer",
        ]
        if DEBUG
        else ["rest_framework.renderers.JSONRenderer"]
    ),
}

# --- Google Calendar integration (read-only, single account) ---------------
GOOGLE_OAUTH_CLIENT_ID = env.str("GOOGLE_OAUTH_CLIENT_ID", default="")
GOOGLE_OAUTH_CLIENT_SECRET = env.str("GOOGLE_OAUTH_CLIENT_SECRET", default="")
GOOGLE_REFRESH_TOKEN = env.str("GOOGLE_REFRESH_TOKEN", default="")
GOOGLE_CALENDAR_ID = env.str("GOOGLE_CALENDAR_ID", default="primary")
GOOGLE_TOKEN_URI = env.str("GOOGLE_TOKEN_URI", default="https://oauth2.googleapis.com/token")

# --- "Secret link" access token --------------------------------------------
CALENDAR_SHARE_TOKEN = env.str("CALENDAR_SHARE_TOKEN", default="")

# --- Logging ---------------------------------------------------------------
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}

# --- Production hardening ---------------------------------------------------
if not DEBUG:
    # Render terminates TLS at its proxy and forwards X-Forwarded-Proto.
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    # Render's edge already redirects HTTP->HTTPS; an app-level redirect can
    # 301 internal health checks. Off by default; opt in if hosting elsewhere.
    SECURE_SSL_REDIRECT = env.bool("DJANGO_SECURE_SSL_REDIRECT", default=False)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30  # 30 days
    # No subdomains/preload on a shared *.onrender.com host (you don't control
    # the parent domain, so preload is inert). Re-enable on a custom apex domain.
    SECURE_HSTS_INCLUDE_SUBDOMAINS = False
    SECURE_HSTS_PRELOAD = False
    SECURE_CONTENT_TYPE_NOSNIFF = True
