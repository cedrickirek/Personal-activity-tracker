# v2: switching from Streamlit to Next.js on Vercel

**Date:** 2026-11-13
**In one line:** after Step 1, I moved the app from Python/Streamlit to Next.js on Vercel, to have a version I can use on my phone today.

## Why

- **Design for my phone.** I judged that a Next.js page on Vercel would work
  better for daily use on my iPhone than Streamlit: a layout made for a small
  screen, and no waiting for a sleeping app to wake up.
- **I was in a hurry.** I wanted a deployed version I could start using the
  same day, so I needed a deployment service I already knew. My portfolio is
  on Vercel; I had never deployed on Streamlit Community Cloud.

The original plan only deployed at its last step, after the agent, voice and
email features. What I needed first was much smaller: typed entries going to
my Google Sheet, from my phone.

## What changed

- The plan became `REBUILD_PLAN_v2.md`; the Streamlit plan is kept as
  `REBUILD_PLAN_v1.md`.
- A new Next.js + TypeScript app in [`web/`](../web/), deployed on Vercel.
  The first version only reads entries in a few fixed formats
  (`9h30 QRT prep`, `9h30-10h15 QRT prep`, `yesterday 21h gym`…), behind a
  password.
- Ported from v1 Step 1, rewritten in TypeScript: the Sheet columns, plain-text
  (RAW) writes, finding a row by its `id` before updating it, Paris time, and
  the "an activity ends when the next one starts" rule, including the fix
  from [the overlap bug](../mistakes/2026-11-12-backfilled-entry-overlapped.md).
- New: an `end_type` column, so the app knows which end times I typed (never
  moved) and which it inferred (may be cut by a later entry).

## What stayed

- The same Google Cloud project, service account and Sheet. Nothing new to
  set up in Google Cloud.
- The v1 Python code stays at the root of the repo. It isn't deployed.

## Next

I'll finish the v2 plan first, then come back to the v1 plan and compare the
two versions.
