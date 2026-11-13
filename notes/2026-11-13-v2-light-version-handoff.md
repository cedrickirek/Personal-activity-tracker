# 2026-11-13 — handoff (v2 light version deployed)

**Next session: finish Step 1b's loose ends (below), then Step 2, the logger
agent (Mistral), under the way of working in section 14 of the plan.**
The brief is `REBUILD_PLAN_v2.md`, in the parent `Monitoring app` folder,
outside the repo. Read it first; this note is the state.

---

## 1. Where things stand

- **Direction changed on 2026-11-13.** Cédric's goal was a deployed version
  usable on his phone first; the v1 plan deployed only at its last step.
  The plan is now v2: Next.js on Vercel, in `web/`. The Streamlit plan is
  kept as `REBUILD_PLAN_v1.md`, and its Step 1 code stays at the repo root,
  not deployed. Story: `issues-and-fixes/v2-switch-to-nextjs-on-vercel.md`.
- **v2 Step 1 is live** on Vercel (pull request #2, merged). Tested on the
  iPhone: login, entries in several formats, survives a refresh, rows in the
  Sheet's `Activities` tab.
- **Step 1b is on branch `v2-step-1b`**, pushed, **not merged**, no pull
  request yet. It adds: setup errors shown as a sentence, the time and date
  at the end of the line (`test 9h30`), a home-screen icon and full-screen
  launch, and a separate `Activities-preview` tab for branch test
  deployments.
- 109 tests pass: `cd web && npm test`.

## 2. Waiting on Cédric

- [ ] Vercel → Settings → Environment Variables: tick **Preview** on the 5
      variables, and add `ACTIVITIES_TAB=Activities-preview` for Preview only.
- [ ] Open the Step 1b pull request (`/compare/main...v2-step-1b`) and merge it.
- [ ] iPhone: Safari → Share → Add to Home Screen; log in once inside it.
- [ ] Delete the `Activities-dev` tab (Claude's local test rows).
- [ ] Optional: `winget install GitHub.cli` then `gh auth login`, so Claude
      can open pull requests directly.
- [ ] Google Cloud → IAM: check `tracker-writer@…` has no role on the
      project (sharing the Sheet is all it needs).
- [ ] Still open from the 2026-11-12 note: delete the first service account
      (project `vernal-day-480009-q1`) and the duplicate Sheet.

## 3. Decisions taken this session

| Decision | Why |
| --- | --- |
| Next.js + TypeScript + Tailwind on Vercel, same repo, folder `web/` | Better on the phone; a platform Cédric knows; one repo, no copy that drifts |
| Same Google Cloud project, service account and Sheet | Nothing new to set up; v1 and v2 share the data |
| Fixed entry formats now, agent in Step 2 | Usable today; formats in plan section 6 |
| New `end_type` column (`stated` / `inferred`) | An end Cédric typed is never moved; an inferred one may be |
| `planned_end`, `comments`, `status` kept but hidden | Cédric types as little as possible; dropping columns would break v1 and the header check |
| One password + signed 30-day cookie | A public address writes to the Sheet; stronger login (TOTP, passkey) later |
| Cache Components off (`next.config.ts`) | Every page depends on the cookie, the time and the live Sheet |
| Local dev writes to `Activities-dev`, previews to `Activities-preview` | Testing never touches real days |
| Pull requests come with a pre-filled link | Cédric doesn't want to copy text from files |

## 4. What went wrong this session

Candidates for `mistakes/` or `issues-and-fixes/`; ask Cédric which, don't
decide for him:

1. **Claude misread the goal.** "Finish the current work" meant "a deployed
   version I can use", not "finish Step 1 as the plan defines it". Led to
   plan v2.
2. **A misspelt variable (`APP_PASSSWORD`) crashed the first deployment**
   with only "A server error occurred", because Next.js hides error
   messages in production. Fixed in Step 1b.
3. **The service account key passed through the chat** when Cédric had it
   selected in VS Code (the extension sends selected text). Cédric accepted
   the risk.
4. **A local test server kept running** after Claude said it was stopped.

## 5. Environment notes

- Next.js 16.4.6: read `web/node_modules/next/dist/docs/` before writing
  Next.js code (see `web/AGENTS.md`).
- `web/.env.local` (git-ignored) was generated from v1's
  `.streamlit/secrets.toml`, with a local-only password.
- Local server: `cd web && npm run build && npx next start -p 3123`; stop it
  by PID afterwards (`netstat -ano`, then `taskkill`).
