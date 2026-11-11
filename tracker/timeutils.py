"""Time helpers. Everything is Paris time, and times of day are "HH:MM" strings.

Times are zero-padded on purpose: with "09:30" rather than "9:30", plain
string comparison ("09:30" < "14:00") gives chronological order, which the
period logic below relies on.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from datetime import datetime

from tracker.config import TIMEZONE


def now() -> datetime:
    """The current moment in Paris (timezone-aware)."""
    return datetime.now(TIMEZONE)


def today_str(at: datetime | None = None) -> str:
    """The Paris date as YYYY-MM-DD."""
    return (at or now()).date().isoformat()


# Accepts 9:30, 09:30, 9h30, 9h, 9 h 30, and 9:30:00. The last form is what
# Google Sheets shows when a time is typed into a cell by hand.
_TIME_OF_DAY = re.compile(r"^(\d{1,2})\s*[:hH]\s*(\d{2})?(?::\d{2})?$")


def normalize_hhmm(value: str) -> str:
    """Return a time of day as "HH:MM", or raise ValueError saying why it's invalid."""
    match = _TIME_OF_DAY.match(str(value).strip())
    if not match:
        raise ValueError(f"'{value}' is not a time; expected HH:MM, like 09:30.")
    hours, minutes = int(match.group(1)), int(match.group(2) or 0)
    if hours > 23 or minutes > 59:
        raise ValueError(f"'{value}' is not a valid time of day.")
    return f"{hours:02d}:{minutes:02d}"


def next_start_after(start: str, starts: Iterable[str]) -> str | None:
    """The original app's infer_periods() rule, as a single function.

    An activity with no explicit end ends when the next activity starts.
    Returns the first start strictly later than `start`, or None if
    nothing comes after it.
    """
    later = sorted(s for s in starts if s > start)
    return later[0] if later else None
