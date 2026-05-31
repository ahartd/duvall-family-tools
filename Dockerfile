# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 — build the React micro-apps with Node, output to frontend/dist/<app>
# ---------------------------------------------------------------------------
FROM node:20-slim AS frontend
WORKDIR /app/frontend
# .dockerignore keeps host node_modules/ and dist/ out, so this copies source.
COPY frontend/ ./
RUN npm ci && npm run build

# ---------------------------------------------------------------------------
# Stage 2 — Python runtime. This base image controls the deployed Python
# version, so it matches local development exactly (Render builds from it).
# ---------------------------------------------------------------------------
FROM python:3.14-slim AS runtime
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app/backend

# Python dependencies first, for better Docker layer caching.
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

# Backend source, then the built frontend from stage 1.
COPY backend/ ./
COPY --from=frontend /app/frontend/dist /app/frontend/dist

# Gather the built apps + admin/DRF assets into STATIC_ROOT (served by
# WhiteNoise). A throwaway secret is fine here; the real one is set at runtime.
RUN DJANGO_DEBUG=false DJANGO_SECRET_KEY=build-only-not-used-at-runtime \
    python manage.py collectstatic --noinput

EXPOSE 10000
# Render injects $PORT (default 10000). Bind 0.0.0.0 so the proxy can reach us.
# `migrate` runs first so admin/session tables exist (and primes a real DB if you
# later set DATABASE_URL). No `--access-logfile`: request lines can carry the
# secret-link token as a query string, which we keep out of logs.
CMD ["sh", "-c", "python manage.py migrate --noinput && gunicorn config.wsgi:application --bind 0.0.0.0:${PORT:-10000} --workers 2 --threads 4 --timeout 60"]
