# 2026-11-12 — handoff (Step 1 done: Google Sheets storage)

**Next session: Step 2, the logger agent, using the new way of working
(section 6).** The plan is `REBUILD_PLAN.md` (kept outside the repo, in the
parent `Monitoring app` folder); this note is the state.

---

## 1. Where things stand

- **Step 1 is done.** Its "done when" check passed on 2026-11-12: entries
  typed in the app appear in the Sheet and survive a page refresh.
- Branch **`step-1-sheets`**, not pushed yet. `main` is still the original
  app. Whether to open a pull request or merge directly is Cédric's call.
- The Sheet `Activity-tracker` is connected through the service account
  `tracker-writer@activity-tracker-514412.iam.gserviceaccount.com`.
  `.streamlit/secrets.toml` holds the key and the Sheet ID, and is git-ignored.
- 44 automated tests pass: `.venv/Scripts/python.exe -m pytest`.

## 2. What was wrong with the original app, and what changed

| # | Problem | In plain words | Technical cause | Fix |
| --- | --- | --- | --- | --- |
| 1 | Crash on unrecognised text | Typing "Starting emails now" crashed the page | `parse_entry()` returned `t` and `activity`, which were only assigned inside `if match:`, so no match → `UnboundLocalError` | Returns `None` instead; the page shows a hint (`tracker/legacy.py`) |
| 2 | Crash on the "today" table | The table crashed as soon as it had a row | `.sort_values(by="Start")` on a DataFrame whose column was `"Time"` → `KeyError` | Table built from the Sheet's rows, sorted by `start` (`app.py`) |
| 3 | Data lost | Entries vanished on refresh or redeploy | Unsaved entries lived in `st.session_state` (per browser tab, wiped on refresh); saved ones in `activities.csv` on the server's disk, which hosting platforms wipe on restart | Every entry is written straight to the Google Sheet, the single source of truth (`tracker/sheets.py`) |
| 4 | Voice could never work online | The mic button would record the server, not my phone | `sr.Microphone()` opens the microphone of the machine running Python; language hard-coded to `en-US` | Removed; Step 3 replaces it with `st.audio_input` (records in the browser) + a transcription API |
| 5 | Lowercased activities | "Emails to Marc" became "emails to marc" | `re.match(..., text.lower())` | Matching is case-insensitive instead |
| 6 | Duplicate code | Two near-identical apps | `app_1.py` | Deleted; notebook moved to `notebooks/` |

Two new problems came up while building Step 1; each has a post-mortem in
`mistakes/`:

- [The Sheet kept refusing the service account](../mistakes/2026-11-12-sheet-refused-the-service-account.md): Google Cloud setup (wrong project, API off, duplicate Sheet).
- [A filled-in-later entry overlapped the one before it](../mistakes/2026-11-12-backfilled-entry-overlapped.md): a logic bug in the new code, found by the first manual test.

## 3. How the app works now, end to end

**In plain words:** I type "9h30 QRT prep". The page reads the time and the
activity, closes whatever I was doing before, and writes a row in my Google
Sheet. The table on the page is read back from the Sheet, so the Sheet is the
only copy of my data.

**Technically**, one click goes through these layers:

```
Browser
  │  Streamlit re-runs app.py from top to bottom on every interaction
  ▼
app.py ............ UI only: form, messages, tables. No business logic.
  ▼
tracker/legacy.py . TEMPORARY (deleted in Step 2)
                    parse_entry(): "9h30 - lunch" → ("09:30", "lunch")
                    log_entry():   the infer_periods rule, then writes
  ▼
tracker/sheets.py . SheetStore: add / update / list activities as dicts
                    validates rows, caches reads, writes RAW
                    get_store(): connects once per server process
  ▼
gspread → Google Sheets API → the "Activities" tab
```

Supporting modules: `tracker/config.py` reads settings from `st.secrets`
(environment variables as a fallback) and defines the Paris timezone;
`tracker/timeutils.py` has "now in Paris", `normalize_hhmm()`, and
`next_start_after()` (the original `infer_periods()` idea as one function).

**The Sheet** has two tabs, created with their header rows by the app on
first run: `Activities` (`id, date, start, end, planned_end, activity,
category, status, comments, raw_input, logged_at`) and `Briefs` (used from
Step 4).

## 4. Design decisions worth being able to explain

| Decision | Why |
| --- | --- |
| Writes use `RAW`, not `USER_ENTERED` | Sheets stores exactly the text sent. Otherwise it converts "09:30" to a time and "2026-11-12" to a date, and runs anything starting with `=` as a formula (formula injection) |
| Reads cached ~15 s, cache cleared on every write | Streamlit re-runs the script on every click and Google allows ~60 reads/minute; the cache keeps clicks fast and under quota, and clearing it on writes means my change shows at once |
| Re-read the Sheet before every update | If rows were sorted or deleted by hand, a cached row number would overwrite the wrong row; the row is found by `id` in fresh data |
| Service account with the `spreadsheets` scope only | Least privilege: the app opens the Sheet by ID, so it needs no Google Drive access, and the account can only reach Sheets explicitly shared with it |
| `st.cache_resource` on `get_store()` | Log in to Google once per server process instead of on every click; a failed connection isn't cached, so the next click retries |
| Times stored as zero-padded `"HH:MM"` text | Plain string comparison ("09:30" < "14:00") then matches time order, which the period logic relies on |
| `tzdata` in `requirements.txt` | Windows has no built-in timezone database, so `zoneinfo` can't find `Europe/Paris` without it |
| Temporary regex input isolated in `legacy.py` | Keeps `app.py` free of logic, and Step 2 deletes one file instead of untangling it |
| Tests run against `FakeWorksheet` (`tests/conftest.py`) | The real `SheetStore` code runs against an in-memory grid: no network, no credentials, 0.1 s. Step 2's tool tests reuse it |
| Setup errors become sentences | Missing key, wrong ID, Sheet not shared, API off: each shows what to fix instead of a stack trace |

## 5. Environment notes (this laptop)

- **Use the project's virtual environment.** A bare `streamlit` runs
  Anaconda's Streamlit 1.50 on Python 3.9, which doesn't have this project's
  packages. Use `.venv/Scripts/streamlit.exe run app.py`, or
  `source .venv/Scripts/activate` once per Git Bash terminal.
- **Low memory:** if numpy fails with an "OpenBLAS" error, start with
  `OPENBLAS_NUM_THREADS=1` in front of the command.
- Paths: Git Bash uses `/c/Users/...` with forward slashes; PowerShell uses
  `C:\Users\...` and `.\.venv\Scripts\...`.

## 6. Still open

- [ ] Delete the first service account in the `vernal-day-480009-q1` project, and its key on the iPhone.
- [ ] Delete the key `.json` from Downloads (`secrets.toml` has everything).
- [ ] Delete the duplicate Sheet, the test rows, and the empty `Sheet1` tab.
- [ ] Push `step-1-sheets`: pull request or direct merge.
- [ ] Step 2 prerequisites: an Anthropic API key (billed separately from any claude.ai subscription), pasted into `secrets.toml` by Cédric; decide the category list (open decision in the plan).

## 7. Next session

Step 2, the logger agent, under the new way of working Cédric proposed on
2026-11-12. In short: Cédric sets the direction and assesses the app first,
proposes what to do, Claude corrects, they agree, then Cédric builds with
Claude explaining what to write, where and why. Details are being agreed in
chat; record the final version here before starting.
