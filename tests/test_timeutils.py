import pytest

from tracker import timeutils


@pytest.mark.parametrize("value, expected", [
    ("09:30", "09:30"),
    ("9:30", "09:30"),
    ("9h30", "09:30"),
    ("9h", "09:00"),
    ("9 h 30", "09:30"),
    ("23:59", "23:59"),
    ("9:30:00", "09:30"),  # how Sheets shows a time typed into a cell
])
def test_normalize_hhmm_accepts_common_formats(value, expected):
    assert timeutils.normalize_hhmm(value) == expected


@pytest.mark.parametrize("value", ["24:00", "9:60", "930", "lunch", "", "9:5"])
def test_normalize_hhmm_rejects_non_times(value):
    with pytest.raises(ValueError):
        timeutils.normalize_hhmm(value)


def test_next_start_after_is_the_infer_periods_rule():
    starts = ["09:00", "14:00", "11:00"]
    assert timeutils.next_start_after("09:00", starts) == "11:00"
    assert timeutils.next_start_after("10:00", starts) == "11:00"
    assert timeutils.next_start_after("14:00", starts) is None


def test_now_is_paris_time():
    assert timeutils.now().tzinfo.key == "Europe/Paris"
