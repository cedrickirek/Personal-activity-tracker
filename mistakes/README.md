# Mistakes Log

Debugging post-mortems for the activity tracker. One file per incident, named
`YYYY-MM-DD-<slug>.md`.

**Purpose:** my learning log. I re-read these to improve as a programmer:
what broke, how it was diagnosed, and what I had misunderstood. Each entry
should be useful months later, to someone who has forgotten the incident
entirely, and should be quiz-able (the Before/After table is the natural
question bank).

**Not the same as `issues-and-fixes/`.** That folder tells the project's
story to a reader such as an interviewer: what forced each new version and
what changed, one file per build step. When an issue there has a post-mortem
here, the story stays short and links here for the detail.

**What belongs here:** things that went wrong and cost real time. Bugs, wrong
diagnoses, misunderstandings about how a library or service behaves.

**What does not:** end-of-session handoffs and plans (those are `notes/`), or
concept clarifications that weren't triggered by something breaking.

Same convention as the `mistakes/` logs on the portfolio and BetterWorld
projects, with one addition: an **In plain words** line, so every entry can be
explained to someone non-technical as well as to an engineer.

## Template

```markdown
# <Short title> — Mistake Note

**Date:** YYYY-MM-DD
**Symptom:** what I actually saw, in one line
**Time lost:** rough estimate
**Root cause:** one line, the real one
**In plain words:** the same story with no jargon

## 1. What happened

Narrative. What I did, what I expected, what I got.

## 2. Before / After

| # | Topic | Before (what I thought ✗) | After (correct ✓) |
| --- | --- | --- | --- |

## 3. The fix

What actually resolved it, with file references.

## 4. How I'd catch this faster next time

Concrete diagnostic moves, not "be more careful".

## 5. One-line summaries to memorize
```

## Entries

- [2026-11-12 — The Sheet kept refusing the service account](2026-11-12-sheet-refused-the-service-account.md)
- [2026-11-12 — A filled-in-later entry overlapped the one before it](2026-11-12-backfilled-entry-overlapped.md)
- [2026-11-12 — It worked on my laptop because my laptop was the server](2026-11-12-my-laptop-was-the-server.md)
