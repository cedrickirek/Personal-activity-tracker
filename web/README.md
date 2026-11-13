# Activity tracker — web app (v2)

Next.js app, deployed on Vercel. I log what I'm doing in a few fixed formats
(`9h30 QRT prep`, `9h30-10h15 QRT prep`, `yesterday 21h gym`…) and each
entry goes to my Google Sheet. The full spec is in `REBUILD_PLAN_v2.md`,
section 6.

## Where things are

| Path | What it does |
| --- | --- |
| `app/page.tsx`, `app/entry-form.tsx` | The page: entry line, Stop current, today's list |
| `app/login/` | The password screen |
| `app/actions.ts` | Server actions called by the forms; each checks the login first |
| `lib/parse.ts` | Reads an entry line (the accepted formats) |
| `lib/periods.ts` | The end-time rules: "ends when the next one starts", midnight, Stop |
| `lib/store.ts` | Activities as rows of the Sheet (header check, add, update by id) |
| `lib/google-sheets.ts` | The Google Sheets API, logged in as the service account |
| `lib/session.ts`, `lib/auth.ts` | The signed 30-day login cookie |
| `lib/time.ts` | Paris time (Vercel's servers run on UTC) |
| `tests/` | Vitest tests, against an in-memory Sheet |

## Run it on my laptop

```bash
cd web
cp .env.example .env.local   # then fill it in (see the comments inside)
npm install
npm test                     # the tests, no network needed
npm run dev                  # http://localhost:3000
```

Locally the app writes to the `Activities-dev` tab, so testing doesn't mix
with my real days.

## Deploy

Vercel project with **Root Directory `web`**. The variables of
`.env.example` are set in the project's settings:

- **Production** (merging into `main`): every variable except
  `ACTIVITIES_TAB`, so it writes to `Activities`.
- **Preview** (every other branch gets its own test address): the same
  variables plus `ACTIVITIES_TAB=Activities-preview`, so testing a branch
  never touches my real days.

Settings only reach new deployments: after changing one, redeploy.
