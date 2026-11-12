"""Shared test fixtures: an in-memory stand-in for a Google Sheet.

FakeWorksheet implements only the handful of gspread methods SheetStore
calls, storing cells as a list of lists of strings. That lets the tests
run the real SheetStore code with no network and no credentials.
"""

from __future__ import annotations

import gspread
import pytest
from gspread.utils import ValueInputOption, a1_to_rowcol

from tracker.sheets import ACTIVITIES_TAB, ACTIVITY_COLUMNS, SheetStore, ensure_worksheet


class FakeWorksheet:
    def __init__(self, title: str, cells: list[list[str]] | None = None) -> None:
        self.title = title
        self.cells = [list(row) for row in cells or []]
        self.reads = 0  # counts API reads, so tests can check the cache
        self.frozen_rows = 0

    def row_values(self, row: int) -> list[str]:
        self.reads += 1
        return list(self.cells[row - 1]) if row <= len(self.cells) else []

    def get_all_values(self) -> list[list[str]]:
        self.reads += 1
        # Like gspread, pad every row to the same width.
        width = max((len(row) for row in self.cells), default=0)
        return [row + [""] * (width - len(row)) for row in self.cells]

    def append_row(self, values, value_input_option=None, table_range=None) -> None:
        # The app must always write RAW (see the comment on RAW in sheets.py).
        assert value_input_option == ValueInputOption.raw
        self.cells.append([str(v) for v in values])

    def update(self, values, range_name=None, value_input_option=None) -> None:
        assert value_input_option == ValueInputOption.raw
        first_row, first_col = a1_to_rowcol(range_name.split(":")[0])
        for row_offset, line in enumerate(values):
            while len(self.cells) < first_row + row_offset:
                self.cells.append([])
            target = self.cells[first_row - 1 + row_offset]
            for col_offset, value in enumerate(line):
                index = first_col - 1 + col_offset
                target.extend([""] * (index + 1 - len(target)))
                target[index] = str(value)

    def freeze(self, rows=None, cols=None) -> None:
        self.frozen_rows = rows


class FakeSpreadsheet:
    def __init__(self, tabs: dict[str, FakeWorksheet] | None = None) -> None:
        self.tabs = dict(tabs or {})

    def worksheet(self, title: str) -> FakeWorksheet:
        if title not in self.tabs:
            raise gspread.exceptions.WorksheetNotFound(title)
        return self.tabs[title]

    def add_worksheet(self, title: str, rows: int, cols: int, index=None) -> FakeWorksheet:
        self.tabs[title] = FakeWorksheet(title)
        return self.tabs[title]


@pytest.fixture
def spreadsheet() -> FakeSpreadsheet:
    return FakeSpreadsheet()


@pytest.fixture
def worksheet(spreadsheet: FakeSpreadsheet) -> FakeWorksheet:
    """An Activities tab with only its header row, set up the way the app does it."""
    return ensure_worksheet(spreadsheet, ACTIVITIES_TAB, ACTIVITY_COLUMNS)


@pytest.fixture
def store(worksheet: FakeWorksheet) -> SheetStore:
    return SheetStore(worksheet)
