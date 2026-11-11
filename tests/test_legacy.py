"""Tests for the temporary regex input. Delete with tracker/legacy.py in step 2."""

from datetime import datetime

import pytest

from tracker import legacy
from tracker.config import TIMEZONE

NOW = datetime(2026, 11, 11, 16, 0, tzinfo=TIMEZONE)


@pytest.mark.parametrize("text, expected", [
    ("9h30 lunch", ("09:30", "lunch")),
    ("9h - studied statistics", ("09:00", "studied statistics")),
    ("14:05 – Emails to Marc", ("14:05", "Emails to Marc")),  # case is kept now
    ("  10H15   prépa QRT  ", ("10:15", "prépa QRT")),
])
def test_parse_entry_reads_time_and_activity(text, expected):
    assert legacy.parse_entry(text) == expected


@pytest.mark.parametrize("text", ["Starting emails now", "", "9h30", "25h00 nap"])
def test_parse_entry_returns_none_instead_of_crashing(text):
    # The original raised UnboundLocalError on input like the first one.
    assert legacy.parse_entry(text) is None


def test_new_entry_closes_the_running_one(store):
    first = legacy.log_entry(store, "09:30", "QRT prep", "9h30 QRT prep", now=NOW)
    second = legacy.log_entry(store, "12:30", "lunch", "12h30 lunch", now=NOW)
    assert store.get_activity(first["id"])["end"] == "12:30"
    assert store.get_activity(first["id"])["status"] == "done"
    assert second["status"] == "in_progress"
    assert second["date"] == "2026-11-11"


def test_back_filled_entry_ends_at_the_next_start(store):
    legacy.log_entry(store, "12:30", "lunch", "12h30 lunch", now=NOW)
    earlier = legacy.log_entry(store, "09:30", "QRT prep", "9h30 QRT prep", now=NOW)
    assert (earlier["end"], earlier["status"]) == ("12:30", "done")
    lunch = store.list_activities()[-1]
    assert lunch["status"] == "in_progress"  # the later activity is untouched
