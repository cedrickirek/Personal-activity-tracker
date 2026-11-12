"""All reads and writes to the Google Sheet.

The Sheet has two tabs:
- Activities: one row per activity, columns in ACTIVITY_COLUMNS
- Briefs: one row per end-of-day brief, columns in BRIEF_COLUMNS (used from step 4)

The rest of the app never touches gspread. It calls SheetStore methods and
gets plain dicts keyed by column name. That boundary is also what lets the
tests run SheetStore against an in-memory fake instead of the real Sheet.
"""

from __future__ import annotations

import threading
import time
import uuid
from datetime import date as date_type
from typing import Any

import gspread
import streamlit as st
from gspread.utils import ValueInputOption, rowcol_to_a1

from tracker import config, timeutils

ACTIVITIES_TAB = "Activities"
BRIEFS_TAB = "Briefs"

ACTIVITY_COLUMNS = [
    "id", "date", "start", "end", "planned_end", "activity",
    "category", "status", "comments", "raw_input", "logged_at",
]
BRIEF_COLUMNS = ["date", "brief_markdown", "sent_to", "sent_at"]

STATUSES = ("in_progress", "done", "abandoned")
TIME_COLUMNS = ("start", "end", "planned_end")
# `id` is a row's identity and `logged_at` records when it was first
# written, so neither can be changed afterwards.
EDITABLE_COLUMNS = frozenset(ACTIVITY_COLUMNS) - {"id", "logged_at"}

# Read and write spreadsheets, nothing else. The app opens the Sheet by its
# ID, so it doesn't need access to Google Drive.
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

# RAW stores exactly the text we send. With USER_ENTERED, Sheets would turn
# "09:30" into a time value, "2026-11-11" into a date, and anything starting
# with "=" into a formula, so a typed "=..." entry could run as one.
RAW = ValueInputOption.raw


class SheetSchemaError(RuntimeError):
    """A tab exists but its header row isn't what the app expects."""


def ensure_worksheet(spreadsheet: Any, title: str, headers: list[str]) -> Any:
    """Return the tab named `title`, creating it and its header row if needed.

    A tab whose first row starts with `headers` is accepted, so extra
    columns you add by hand at the end are left alone.
    """
    try:
        worksheet = spreadsheet.worksheet(title)
    except gspread.exceptions.WorksheetNotFound:
        worksheet = spreadsheet.add_worksheet(title=title, rows=1000, cols=len(headers))

    current = worksheet.row_values(1)
    if not current:
        worksheet.update(values=[headers], range_name="A1", value_input_option=RAW)
        worksheet.freeze(rows=1)  # keep the headers visible when scrolling the Sheet
    elif current[: len(headers)] != headers:
        raise SheetSchemaError(
            f"The '{title}' tab's first row should start with {headers}, but it is "
            f"{current}. Fix that row, or rename the tab so the app creates a new one."
        )
    return worksheet


class SheetStore:
    """Activities stored in a worksheet, as dicts keyed by column name."""

    def __init__(self, activities: Any, cache_seconds: float = 15.0) -> None:
        self._ws = activities
        # Streamlit re-runs the whole script on every click, and Google allows
        # about 60 reads a minute. Reads are therefore cached briefly, and any
        # write clears the cache so the next read shows the change at once.
        self._cache_seconds = cache_seconds
        self._cache: list[tuple[int, dict[str, str]]] | None = None
        self._cache_time = 0.0
        # Two browser tabs can trigger two reruns at the same moment.
        self._lock = threading.RLock()

    # ---- reads ----------------------------------------------------------

    def list_activities(self, date: str | None = None) -> list[dict[str, str]]:
        """All activities (or one day's), oldest first. Returns copies."""
        rows = [dict(row) for _, row in self._rows()]
        if date is not None:
            rows = [row for row in rows if row["date"] == date]
        return sorted(rows, key=lambda row: (row["date"], row["start"]))

    def get_activity(self, activity_id: str) -> dict[str, str] | None:
        for _, row in self._rows():
            if row["id"] == activity_id:
                return dict(row)
        return None

    # ---- writes ---------------------------------------------------------

    def add_activity(
        self,
        *,
        date: str,
        start: str,
        activity: str,
        end: str = "",
        planned_end: str = "",
        category: str = "",
        status: str = "in_progress",
        comments: str = "",
        raw_input: str = "",
        logged_at: str | None = None,
    ) -> dict[str, str]:
        """Append one activity and return it as stored (with its new id)."""
        row = _validated({
            "id": uuid.uuid4().hex[:8],  # short, and unique enough for one person's log
            "date": date,
            "start": start,
            "end": end,
            "planned_end": planned_end,
            "activity": activity,
            "category": category,
            "status": status,
            "comments": comments,
            "raw_input": raw_input,
            "logged_at": logged_at or timeutils.now().isoformat(timespec="seconds"),
        })
        with self._lock:
            # table_range="A1" makes Sheets append below the table that starts
            # at A1, instead of guessing where "the table" is.
            self._ws.append_row(
                [row[c] for c in ACTIVITY_COLUMNS], value_input_option=RAW, table_range="A1"
            )
            self._cache = None
        return row

    def update_activity(self, activity_id: str, fields: dict[str, Any]) -> dict[str, str]:
        """Change some fields of one activity and return the updated row."""
        not_editable = set(fields) - EDITABLE_COLUMNS
        if not_editable:
            raise ValueError(f"These fields can't be changed: {sorted(not_editable)}.")

        with self._lock:
            # Always re-read before writing: if rows were sorted or deleted by
            # hand in the Sheet, a cached row number would point at the wrong row.
            for row_number, row in self._rows(fresh=True):
                if row["id"] == activity_id:
                    break
            else:
                raise ValueError(f"No activity has the id '{activity_id}'.")

            updated = _validated({**row, **fields})
            last_cell = rowcol_to_a1(row_number, len(ACTIVITY_COLUMNS))
            self._ws.update(
                values=[[updated[c] for c in ACTIVITY_COLUMNS]],
                range_name=f"A{row_number}:{last_cell}",
                value_input_option=RAW,
            )
            self._cache = None
        return updated

    # ---- internals ------------------------------------------------------

    def _rows(self, fresh: bool = False) -> list[tuple[int, dict[str, str]]]:
        """(sheet row number, row dict) for every non-empty data row."""
        with self._lock:
            expired = time.monotonic() - self._cache_time > self._cache_seconds
            if fresh or self._cache is None or expired:
                values = self._ws.get_all_values()
                self._cache = [
                    (number, _row_from_cells(cells))
                    for number, cells in enumerate(values[1:], start=2)  # row 1 is the header
                    if any(str(cell).strip() for cell in cells[: len(ACTIVITY_COLUMNS)])
                ]
                self._cache_time = time.monotonic()
            return self._cache


def _row_from_cells(cells: list[Any]) -> dict[str, str]:
    """Map one Sheet row to a dict. Only the app's own columns are read."""
    padded = [str(c) for c in cells] + [""] * (len(ACTIVITY_COLUMNS) - len(cells))
    row = dict(zip(ACTIVITY_COLUMNS, padded))
    for column in TIME_COLUMNS:
        # A time typed by hand into the Sheet comes back as "9:30:00".
        # Put it back to "09:30"; leave anything unreadable as it is.
        if row[column]:
            try:
                row[column] = timeutils.normalize_hhmm(row[column])
            except ValueError:
                pass
    return row


def _validated(row: dict[str, Any]) -> dict[str, str]:
    """Check an activity row before it is written. Raise ValueError if it's invalid."""
    row = {column: "" if row.get(column) is None else str(row[column]).strip()
           for column in ACTIVITY_COLUMNS}
    try:
        date_type.fromisoformat(row["date"])
    except ValueError:
        raise ValueError(f"date '{row['date']}' must be YYYY-MM-DD.") from None
    if not row["start"]:
        raise ValueError("start is required.")
    for column in TIME_COLUMNS:
        if row[column]:
            row[column] = timeutils.normalize_hhmm(row[column])
    if not row["activity"]:
        raise ValueError("activity can't be empty.")
    if row["status"] not in STATUSES:
        raise ValueError(f"status '{row['status']}' must be one of {list(STATUSES)}.")
    return row


@st.cache_resource(show_spinner="Connecting to Google Sheets...")
def get_store() -> SheetStore:
    """Connect to the Sheet once per server process and reuse the connection.

    Streamlit re-runs app.py on every click. Without this cache, each click
    would log in to Google and check the tabs again. If connecting fails,
    nothing is cached, so the next click simply tries again.
    """
    info = config.service_account_info()
    sheet_id = config.sheet_id()
    try:
        client = gspread.service_account_from_dict(info, scopes=SCOPES)
    except (ValueError, KeyError) as error:
        raise config.ConfigError(
            f"The service-account key in secrets.toml looks malformed ({error}). "
            "Re-copy it from the downloaded JSON file."
        ) from error

    try:
        spreadsheet = client.open_by_key(sheet_id)
    except gspread.exceptions.SpreadsheetNotFound as error:
        raise config.ConfigError(
            f"No Google Sheet has the ID `{sheet_id}`. Check SHEET_ID: it's the part "
            "of the Sheet's URL between /d/ and /edit."
        ) from error
    except PermissionError as error:
        # gspread raises the same PermissionError for two different problems.
        # Google's own message, kept on the original error, tells them apart.
        google_message = str(error.__cause__ or error)
        if "has not been used" in google_message or "disabled" in google_message:
            raise config.ConfigError(
                "The Google Sheets API is turned off for this Google Cloud project. "
                "Enable it in APIs & Services → Library → Google Sheets API, wait a "
                "minute, then reload."
            ) from error
        raise config.ConfigError(
            f"The service account can't open the Sheet. Share the Sheet (Editor) "
            f"with {info['client_email']}."
        ) from error

    activities = ensure_worksheet(spreadsheet, ACTIVITIES_TAB, ACTIVITY_COLUMNS)
    ensure_worksheet(spreadsheet, BRIEFS_TAB, BRIEF_COLUMNS)
    return SheetStore(activities)
