# 2026-11-12 — handoff (Step 1 done: Google Sheets storage)

**Next session: Step 2, the logger agent, with a Mistral model and the new
way of working (section 7).** The plan is `REBUILD_PLAN.md` (kept outside the repo, in the
parent `Monitoring app` folder); this note is the state.

---

## 1. Where things stand

- **Step 1 is done.** Its "done when" check passed on 2026-11-12: entries
  typed in the app appear in the Sheet and survive a page refresh.
- Branch **`step-1-sheets`**, pushed to GitHub on 2026-11-12. Cédric chose
  a pull request over a direct merge. Don't merge it until Cédric's
  `issues-and-fixes/` file for Step 1 is on the branch. `main` is still the
  original app.
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

Problems 3 and 4 come from the same wrong belief, that the Python code runs
on the device I use the app from:
[It worked on my laptop because my laptop was the server](../mistakes/2026-11-12-my-laptop-was-the-server.md).

Two new problems came up while building Step 1; each has a post-mortem in
`mistakes/`:

- [The Sheet kept refusing the service account](../mistakes/2026-11-12-sheet-refused-the-service-account.md): Google Cloud setup (wrong project, API off, duplicate Sheet).
- [A filled-in-later entry overlapped the one before it](../mistakes/2026-11-12-backfilled-entry-overlapped.md): a logic bug in the new code, found by the first manual test.

**Where this goes (agreed 2026-11-12).** Cédric writes the Step 1 story in
`issues-and-fixes/step-1-google-sheets.md`; once it exists, this section
becomes a link to it.

| Issue | `issues-and-fixes/` | `mistakes/` |
| --- | --- | --- |
| 3 Data lost, 4 Voice can't work online | Yes, as the main reasons for Step 1 | Yes, one shared note |
| 1, 2, 5, 6 (crashes, lowercasing, duplicate file) | Yes, as smaller fixes | No |
| Filled-in-later entry overlapped | Yes, briefly, linking to its note | Yes |
| The Sheet refused the service account | No (setup trouble, not a change to the app) | Yes |
| The text input can't read time ranges ("7h40 à 8h50 somnolence") | Yes, at the end, as what's still wrong and why Step 2 adds an agent | No |

Suggested outline for that file: where it started (the original app's
problems), what Step 1 changed and why, what went wrong during the step,
what's still wrong.

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
- [x] Push `step-1-sheets` (done 2026-11-12; Cédric chose a pull request).
- [ ] Open the pull request from https://github.com/cedrickirek/Personal-activity-tracker/pull/new/step-1-sheets (the GitHub CLI isn't installed on this laptop).
- [ ] Cédric writes `issues-and-fixes/step-1-google-sheets.md` (section 2), Claude reviews; then merge the pull request.
- [ ] Update section 3 of `REBUILD_PLAN.md` for the model decision (section 7). Cédric's task.
- [ ] Step 2 prerequisites: a Mistral API key, pasted into `secrets.toml` by Cédric, and the category list (open decision in the plan). An Anthropic API key (billed separately from any claude.ai subscription) is only needed from Step 4.

## 7. Next session

Step 2, the logger agent.

**Model decision (2026-11-12; changes section 3 of the plan).** The logger
agent uses a **Mistral** model through Mistral's API, partly because Cédric
is preparing for an interview with Mistral. The daily brief (Step 4) stays
on **Claude**. Keep the tool definitions and their checks independent of the
provider, with a thin model client as the only Mistral-specific code, so the
model can be swapped by configuration. `secrets.toml.example` needs a
`MISTRAL_API_KEY` and a Mistral `LOGGER_MODEL`; choose the model at the start
of Step 2 and check current names and prices then.

**Long-term goal:** replace the hosted logger with a small open-weight
Mistral model fine-tuned on this task (Cédric said Mistral 7B; newer small
Mistral models may fit better). Order: collect examples (`raw_input` and
corrections) and build an evaluation set, then a supervised fine-tune
(LoRA), then reinforcement learning with a reward computed by checking the
tool calls, then decide where it runs. Streamlit Community Cloud can't run a
7B model, and this laptop is short on memory.

**Way of working (agreed 2026-11-12):**

1. Cédric gives the direction.
2. Cédric assesses the current state of the app to find the next steps.
3. Claude asks what Cédric thinks should be done; Cédric answers; Claude
   corrects, with reasons.
4. They agree on the corrected plan.
5. They build. Cédric types the core: the agent loop, tool definitions,
   prompts and validation, anything an interviewer would ask about. Claude
   drafts the boilerplate (test scaffolding, config, requirements), and
   Cédric explains it back before it's committed.
6. Cédric runs and tests it.
7. Cédric writes the step's file in `issues-and-fixes/` in Cédric's own
   voice, and Claude reviews it. Cédric makes the commits.

Claude asks clarifying questions instead of assuming, especially when a new
concept, folder or convention comes up.

**Where things are written:**

- `issues-and-fixes/`: the project's story for a reader such as an
  interviewer. What went wrong, what forced each new version, and what
  changed. One file per build step, written by Cédric.
- `mistakes/`: Cédric's learning log of debugging post-mortems (template in
  `mistakes/README.md`). An `issues-and-fixes/` file links here for the
  detail instead of copying it.
- `notes/`: session handoffs like this one.
