"""One-time helper to obtain the Google refresh token the platform runs on.

Run this locally (it opens a browser):

    python manage.py google_auth

It uses GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET (or a downloaded
client-secret JSON via --client-secrets) to run the installed-app loopback
flow, then prints the refresh token to paste into your deployment's
GOOGLE_REFRESH_TOKEN environment variable.

The token is granted two scopes: read-only Calendar (for the calendar/dashboard
tools) and read/write Sheets (for the todos/notes tools, which store data in the
backing spreadsheet). Re-run this whenever the set of scopes changes.
"""
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from calendar_app.services import CALENDAR_READONLY_SCOPE
from core.google_sheets import SHEETS_SCOPE


class Command(BaseCommand):
    help = "Obtain the Google refresh token (Calendar read + Sheets read/write) via OAuth."

    def add_arguments(self, parser):
        parser.add_argument(
            "--client-secrets",
            dest="client_secrets",
            default="",
            help=(
                "Path to a client_secret.json downloaded from Google Cloud. "
                "If omitted, GOOGLE_OAUTH_CLIENT_ID/SECRET env vars are used."
            ),
        )
        parser.add_argument(
            "--port",
            type=int,
            default=0,
            help="Local port for the OAuth redirect (0 = pick a free port).",
        )

    def handle(self, *args, **options):
        try:
            from google_auth_oauthlib.flow import InstalledAppFlow
        except ImportError as exc:
            raise CommandError("google-auth-oauthlib is not installed.") from exc

        scopes = [CALENDAR_READONLY_SCOPE, SHEETS_SCOPE]
        client_secrets = options["client_secrets"]

        if client_secrets:
            flow = InstalledAppFlow.from_client_secrets_file(client_secrets, scopes)
        else:
            client_id = settings.GOOGLE_OAUTH_CLIENT_ID
            client_secret = settings.GOOGLE_OAUTH_CLIENT_SECRET
            if not client_id or not client_secret:
                raise CommandError(
                    "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET "
                    "(e.g. in backend/.env), or pass "
                    "--client-secrets path/to/client_secret.json."
                )
            client_config = {
                "installed": {
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": settings.GOOGLE_TOKEN_URI,
                    "redirect_uris": ["http://localhost"],
                }
            }
            flow = InstalledAppFlow.from_client_config(client_config, scopes)

        # access_type=offline + prompt=consent guarantees a refresh token comes back.
        creds = flow.run_local_server(
            port=options["port"],
            access_type="offline",
            prompt="consent",
            authorization_prompt_message="Opening your browser to authorise calendar access...",
            success_message="Authorisation complete — you can close this tab and return to the terminal.",
        )

        if not creds.refresh_token:
            raise CommandError(
                "No refresh token was returned. Make sure your OAuth consent "
                "screen is published (not in 'Testing'), then try again."
            )

        self.stdout.write(
            self.style.SUCCESS(
                "\nSuccess! Add this to your environment "
                "(Render dashboard, or backend/.env locally):\n"
            )
        )
        self.stdout.write(f"GOOGLE_REFRESH_TOKEN={creds.refresh_token}\n")
        self.stdout.write(
            self.style.WARNING(
                "\nKeep this secret — it grants read-only calendar access and "
                "read/write access to your Sheets.\n"
            )
        )
