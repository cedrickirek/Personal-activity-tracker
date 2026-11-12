"""TEMPORARY: the original "9h30 activity" text input.

It keeps the app usable while storage moves to Google Sheets (rebuild
step 1). Step 2 replaces it with the logger agent, and this module and
its tests get deleted then.
"""

from __future__ import annotations

import re
from datetime import datetime

from tracker import timeutils
from tracker.sheets import SheetStore

# "<time> [separator] <activity>", e.g. "9h30 lunch", "9h - emails", "14:05 – call".
_ENTRY = re.compile(r"^\s*(\d{1,2}\s*[h:]\s*\d{0,2})\s*[-–—:]?\s*(.+?)\s*$", re.IGNORECASE)


def parse_entry(text: str) -> tuple[str, str] | None:
    """Parse "9h30 - lunch" into ("09:30", "lunch"), or return None if it can't.

    This fixes two bugs in the original version. It raised UnboundLocalError
    on any text that didn't match, because `t` and `activity` were never
    assigned. It also lowercased the activity.
    """
    match = _ENTRY.match(text or "")
    if not match:
        return None
    time_part, activity = match.groups()
    try:
        start = timeutils.normalize_hhmm(time_part)
    except ValueError:  # e.g. "25h00" or "9:7"
        return None
    return start, activity


def log_entry(
    store: SheetStore,
    start: str,
    activity: str,
    raw_input: str,
    now: datetime | None = None,
) -> dict[str, str]:
    """Write one entry for today, applying the original infer_periods() rule.

    The old app applied the rule once, on "Save Day's Table". Here it runs as
    each entry arrives, because every entry goes straight to the Sheet.
    """
    now = now or timeutils.now()
    today = timeutils.today_str(now)
    todays = store.list_activities(date=today)

    # 1. Whatever was going on at `start` stops there. That is the activity
    #    still running, and also an earlier activity whose end runs past
    #    `start`. Moving that end is safe here because this input can't state
    #    an end: every end it wrote was inferred by this same rule.
    for row in todays:
        running = row["status"] == "in_progress" and row["start"] <= start
        interrupted = row["status"] == "done" and row["start"] < start < row["end"]
        if running or interrupted:
            store.update_activity(row["id"], {"end": start, "status": "done"})

    # 2. An entry filled in after the fact (earlier than something already
    #    logged) ends where the next activity starts.
    next_start = timeutils.next_start_after(start, (row["start"] for row in todays))

    return store.add_activity(
        date=today,
        start=start,
        activity=activity,
        end=next_start or "",
        status="done" if next_start else "in_progress",
        raw_input=raw_input,
        logged_at=now.isoformat(timespec="seconds"),
    )
