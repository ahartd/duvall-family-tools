"""Google Sheets as a tiny durable datastore.

The platform is otherwise stateless (Render's free tier has no persistent disk),
but todos / notes need to survive redeploys — so the *family already lives in
Google*, we keep them in a Google Sheet. One spreadsheet (``LISTS_SHEET_ID``)
holds a tab per table; each row is a record keyed by an ``id`` column.

Credentials are reconstructed from the same env vars the calendar uses, but the
refresh token must additionally carry the read/write Sheets scope (re-run
``manage.py google_auth`` once to mint a token with both scopes).
"""
from __future__ import annotations

import logging

from django.conf import settings
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

logger = logging.getLogger(__name__)

# Read + write a spreadsheet we already have access to (no Drive scope needed —
# the spreadsheet is created out of band and referenced by id).
SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets"


class SheetsNotConfigured(RuntimeError):
    """Google OAuth env vars or the spreadsheet id are missing."""


class SheetsUnavailable(RuntimeError):
    """Google returned an error we can't recover from."""


def _credentials() -> Credentials:
    missing = [
        name
        for name in (
            "GOOGLE_OAUTH_CLIENT_ID",
            "GOOGLE_OAUTH_CLIENT_SECRET",
            "GOOGLE_REFRESH_TOKEN",
        )
        if not getattr(settings, name)
    ]
    if missing:
        raise SheetsNotConfigured("Missing Google OAuth settings: " + ", ".join(missing))
    return Credentials(
        token=None,
        refresh_token=settings.GOOGLE_REFRESH_TOKEN,
        client_id=settings.GOOGLE_OAUTH_CLIENT_ID,
        client_secret=settings.GOOGLE_OAUTH_CLIENT_SECRET,
        token_uri=settings.GOOGLE_TOKEN_URI,
        scopes=[SHEETS_SCOPE],
    )


def _service():
    # cache_discovery=False: no file-cache write on the read-only/ephemeral FS.
    return build("sheets", "v4", credentials=_credentials(), cache_discovery=False)


class SheetTable:
    """A single tab modelled as rows of ``columns`` (the first being ``id``).

    Tiny family-scale data, so reads pull the whole tab and writes locate a row
    by scanning the id column — no indexes, no transactions. Good enough, and it
    keeps the sheet hand-editable.
    """

    def __init__(self, tab: str, columns: list[str]):
        self.tab = tab
        self.columns = columns

    # -- low level ----------------------------------------------------------
    @property
    def _sheet_id(self) -> str:
        sid = settings.LISTS_SHEET_ID
        if not sid:
            raise SheetsNotConfigured("Set LISTS_SHEET_ID to the backing spreadsheet's id.")
        return sid

    def _values(self):
        return _service().spreadsheets().values()

    def ensure(self) -> None:
        """Create the tab (and header row) if it isn't there yet."""
        svc = _service().spreadsheets()
        try:
            meta = svc.get(spreadsheetId=self._sheet_id).execute()
            titles = {s["properties"]["title"] for s in meta.get("sheets", [])}
            if self.tab not in titles:
                svc.batchUpdate(
                    spreadsheetId=self._sheet_id,
                    body={"requests": [{"addSheet": {"properties": {"title": self.tab}}}]},
                ).execute()
            header = (
                self._values()
                .get(spreadsheetId=self._sheet_id, range=f"{self.tab}!1:1")
                .execute()
                .get("values", [[]])
            )
            if not header or header[0][: len(self.columns)] != self.columns:
                self._values().update(
                    spreadsheetId=self._sheet_id,
                    range=f"{self.tab}!A1",
                    valueInputOption="RAW",
                    body={"values": [self.columns]},
                ).execute()
        except SheetsNotConfigured:
            raise
        except Exception as exc:  # noqa: BLE001 — google client raises many types
            logger.exception("Sheet ensure failed for %s", self.tab)
            raise SheetsUnavailable(str(exc)) from exc

    def read(self) -> list[dict]:
        """All rows as dicts; ``_row`` is the 1-based sheet row number."""
        try:
            rows = (
                self._values()
                .get(spreadsheetId=self._sheet_id, range=f"{self.tab}!A1:Z")
                .execute()
                .get("values", [])
            )
        except SheetsNotConfigured:
            raise
        except Exception as exc:  # noqa: BLE001
            # A 400 usually means the tab doesn't exist yet — create it and retry.
            logger.warning("Sheet read failed for %s (%s); ensuring schema", self.tab, exc)
            self.ensure()
            rows = (
                self._values()
                .get(spreadsheetId=self._sheet_id, range=f"{self.tab}!A1:Z")
                .execute()
                .get("values", [])
            )
        if not rows:
            return []
        header = rows[0]
        out: list[dict] = []
        for i, raw in enumerate(rows[1:], start=2):
            if not any(c.strip() for c in raw):
                continue
            record = {header[j]: (raw[j] if j < len(raw) else "") for j in range(len(header))}
            record["_row"] = i
            out.append(record)
        return out

    def find(self, record_id: str) -> dict | None:
        for r in self.read():
            if r.get("id") == record_id:
                return r
        return None

    def append(self, record: dict) -> None:
        row = [str(record.get(col, "")) for col in self.columns]
        try:
            self._values().append(
                spreadsheetId=self._sheet_id,
                range=f"{self.tab}!A1",
                valueInputOption="RAW",
                insertDataOption="INSERT_ROWS",
                body={"values": [row]},
            ).execute()
        except SheetsNotConfigured:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.exception("Sheet append failed for %s", self.tab)
            raise SheetsUnavailable(str(exc)) from exc

    def update(self, row_number: int, record: dict) -> None:
        row = [str(record.get(col, "")) for col in self.columns]
        try:
            self._values().update(
                spreadsheetId=self._sheet_id,
                range=f"{self.tab}!A{row_number}",
                valueInputOption="RAW",
                body={"values": [row]},
            ).execute()
        except SheetsNotConfigured:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.exception("Sheet update failed for %s", self.tab)
            raise SheetsUnavailable(str(exc)) from exc

    def delete(self, row_number: int) -> None:
        svc = _service().spreadsheets()
        try:
            meta = svc.get(spreadsheetId=self._sheet_id).execute()
            gid = next(
                s["properties"]["sheetId"]
                for s in meta["sheets"]
                if s["properties"]["title"] == self.tab
            )
            svc.batchUpdate(
                spreadsheetId=self._sheet_id,
                body={
                    "requests": [
                        {
                            "deleteDimension": {
                                "range": {
                                    "sheetId": gid,
                                    "dimension": "ROWS",
                                    "startIndex": row_number - 1,
                                    "endIndex": row_number,
                                }
                            }
                        }
                    ]
                },
            ).execute()
        except SheetsNotConfigured:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.exception("Sheet delete failed for %s", self.tab)
            raise SheetsUnavailable(str(exc)) from exc
