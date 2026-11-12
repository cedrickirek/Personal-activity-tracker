import pytest

from conftest import FakeSpreadsheet, FakeWorksheet
from tracker.sheets import (
    ACTIVITIES_TAB,
    ACTIVITY_COLUMNS,
    BRIEF_COLUMNS,
    BRIEFS_TAB,
    SheetSchemaError,
    SheetStore,
    ensure_worksheet,
)


def add(store, **overrides):
    fields = {"date": "2026-11-11", "start": "09:30", "activity": "QRT prep"}
    return store.add_activity(**{**fields, **overrides})


# ---- tab setup ----------------------------------------------------------

def test_missing_tab_is_created_with_headers(spreadsheet):
    ws = ensure_worksheet(spreadsheet, BRIEFS_TAB, BRIEF_COLUMNS)
    assert spreadsheet.tabs[BRIEFS_TAB] is ws
    assert ws.cells == [BRIEF_COLUMNS]
    assert ws.frozen_rows == 1


def test_empty_existing_tab_gets_headers():
    spreadsheet = FakeSpreadsheet({ACTIVITIES_TAB: FakeWorksheet(ACTIVITIES_TAB)})
    ws = ensure_worksheet(spreadsheet, ACTIVITIES_TAB, ACTIVITY_COLUMNS)
    assert ws.cells == [ACTIVITY_COLUMNS]


def test_extra_columns_added_by_hand_are_accepted():
    ws = FakeWorksheet(ACTIVITIES_TAB, [ACTIVITY_COLUMNS + ["my notes"]])
    spreadsheet = FakeSpreadsheet({ACTIVITIES_TAB: ws})
    assert ensure_worksheet(spreadsheet, ACTIVITIES_TAB, ACTIVITY_COLUMNS) is ws


def test_wrong_headers_are_reported_not_overwritten():
    ws = FakeWorksheet(ACTIVITIES_TAB, [["Start", "End", "Activity"]])
    spreadsheet = FakeSpreadsheet({ACTIVITIES_TAB: ws})
    with pytest.raises(SheetSchemaError):
        ensure_worksheet(spreadsheet, ACTIVITIES_TAB, ACTIVITY_COLUMNS)
    assert ws.cells == [["Start", "End", "Activity"]]


# ---- adding -------------------------------------------------------------

def test_added_activity_is_written_in_column_order(store, worksheet):
    row = add(store, planned_end="15:00", raw_input="9h30 QRT prep")
    assert len(row["id"]) == 8
    assert row["status"] == "in_progress"
    assert row["logged_at"]  # filled in automatically
    assert worksheet.cells[1] == [row[c] for c in ACTIVITY_COLUMNS]


def test_activity_survives_a_page_refresh(store, worksheet):
    """A refresh is a new store reading the same Sheet: nothing lives in memory."""
    row = add(store)
    assert SheetStore(worksheet).list_activities() == [row]


def test_times_are_normalised_on_write(store):
    assert add(store, start="9h05", planned_end="15h")["start"] == "09:05"
    assert store.list_activities()[0]["planned_end"] == "15:00"


@pytest.mark.parametrize("overrides, message", [
    ({"start": "25:00"}, "not a valid time"),
    ({"start": ""}, "start is required"),
    ({"activity": "   "}, "activity can't be empty"),
    ({"status": "finished"}, "status"),
    ({"date": "11/11/2026"}, "YYYY-MM-DD"),
])
def test_invalid_activity_is_rejected_with_a_clear_message(store, worksheet, overrides, message):
    with pytest.raises(ValueError, match=message):
        add(store, **overrides)
    assert len(worksheet.cells) == 1  # nothing written


# ---- reading ------------------------------------------------------------

def test_list_filters_by_date_and_sorts_by_start(store):
    add(store, start="14:00", activity="emails")
    add(store, start="09:00", activity="QRT prep")
    add(store, date="2026-11-10", start="10:00", activity="yesterday")
    today = store.list_activities(date="2026-11-11")
    assert [r["activity"] for r in today] == ["QRT prep", "emails"]
    assert len(store.list_activities()) == 3


def test_hand_typed_times_and_blank_rows_are_handled(worksheet):
    worksheet.cells.append(["abc", "2026-11-11", "9:30:00", "", "", "lunch", "", "done"])
    worksheet.cells.append([""] * len(ACTIVITY_COLUMNS))
    rows = SheetStore(worksheet).list_activities()
    assert len(rows) == 1
    assert rows[0]["start"] == "09:30"
    assert rows[0]["raw_input"] == ""  # short row padded


def test_reads_are_cached_and_writes_clear_the_cache(store, worksheet):
    reads_before = worksheet.reads
    store.list_activities()
    store.list_activities()
    assert worksheet.reads == reads_before + 1
    add(store)
    assert len(store.list_activities()) == 1  # the new row shows immediately


# ---- updating -----------------------------------------------------------

def test_update_changes_only_the_target_row(store, worksheet):
    first = add(store, activity="QRT prep")
    second = add(store, start="11:00", activity="emails")
    updated = store.update_activity(first["id"], {"end": "11:00", "status": "done"})
    assert updated["end"] == "11:00"
    assert store.get_activity(first["id"])["status"] == "done"
    assert store.get_activity(second["id"]) == second


def test_update_finds_the_row_even_after_rows_were_moved_by_hand(store, worksheet):
    first = add(store, activity="first")
    second = add(store, start="11:00", activity="second")
    store.list_activities()  # cache the current row positions
    worksheet.cells[1], worksheet.cells[2] = worksheet.cells[2], worksheet.cells[1]
    store.update_activity(first["id"], {"comments": "moved"})
    assert worksheet.cells[2][ACTIVITY_COLUMNS.index("comments")] == "moved"
    assert worksheet.cells[1][ACTIVITY_COLUMNS.index("id")] == second["id"]


def test_update_rejects_unknown_ids_and_protected_fields(store):
    row = add(store)
    with pytest.raises(ValueError, match="No activity"):
        store.update_activity("nope", {"status": "done"})
    with pytest.raises(ValueError, match="can't be changed"):
        store.update_activity(row["id"], {"id": "other"})
    with pytest.raises(ValueError, match="must be one of"):
        store.update_activity(row["id"], {"status": "finished"})
