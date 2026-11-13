// The main page: the entry line, then today's entries read from the Sheet.
// Rendered on the server on every request (it depends on the login cookie and
// the live Sheet), so a refresh always shows what's really in the Sheet.

import { requireLogin } from "@/lib/auth";
import { ConfigError } from "@/lib/config";
import { getStore } from "@/lib/google-sheets";
import { FORMAT_HELP } from "@/lib/parse";
import { todayView, type TodayItem } from "@/lib/periods";
import { SheetSchemaError } from "@/lib/store";
import { parisNow } from "@/lib/time";
import { logout } from "./actions";
import { EntryForm } from "./entry-form";

export default async function Home() {
  await requireLogin();
  const now = parisNow();

  let items: TodayItem[] = [];
  let problem: string | null = null;
  try {
    items = todayView(await getStore().list(), now);
  } catch (error) {
    // Setup problems are shown as a sentence saying what to fix.
    if (error instanceof ConfigError || error instanceof SheetSchemaError) problem = error.message;
    else throw error;
  }

  const title = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <main className="mx-auto w-full max-w-md flex-1 space-y-6 px-4 py-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">{title}</h1>
        <form action={logout}>
          <button type="submit" className="text-sm text-zinc-500 underline">
            Log out
          </button>
        </form>
      </header>

      <EntryForm formats={FORMAT_HELP} />

      {problem ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {problem}
        </p>
      ) : (
        <section>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-zinc-500">Today</h2>
          {items.length === 0 ? (
            <p className="text-sm text-zinc-500">Nothing logged yet today.</p>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {items.map((item) => (
                <li key={item.id} className="flex gap-3 py-2.5">
                  <span className="w-28 shrink-0 font-mono text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
                    {item.startedYesterday && <span className="text-xs">yest. </span>}
                    {item.start}–{item.running ? "" : item.end}
                  </span>
                  <span className="min-w-0 flex-1 break-words">
                    {item.activity}
                    {item.running && (
                      <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100">
                        running
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
