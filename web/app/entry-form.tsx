"use client";

// The entry line and the two buttons. A client component only because it
// shows the server's answer and a "Saving…" state; the work happens in the
// server actions (app/actions.ts).

import { useActionState } from "react";
import { logEntry, stopCurrent, type FormState } from "./actions";

const initial: FormState = { status: "idle", message: "", text: "", at: 0 };

export function EntryForm({ formats }: { formats: string[] }) {
  const [logState, logAction, logging] = useActionState(logEntry, initial);
  const [stopState, stopAction, stopping] = useActionState(stopCurrent, initial);
  // Show whichever answer came last.
  const latest = stopState.at > logState.at ? stopState : logState;
  const busy = logging || stopping;

  return (
    <section className="space-y-3">
      <form action={logAction} className="flex gap-2">
        <input
          // A new key after each answer re-creates the box: empty after a
          // success, holding what I typed after an error.
          key={logState.at}
          name="entry"
          defaultValue={logState.status === "error" ? logState.text : ""}
          placeholder="9h30 QRT prep"
          aria-label="Entry"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
          // 16px or more, otherwise iPhone Safari zooms in when the box is tapped.
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-3 text-base text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-300"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-zinc-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {logging ? "Saving…" : "Log"}
        </button>
      </form>

      <form action={stopAction}>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-base font-medium disabled:opacity-50 dark:border-zinc-700"
        >
          {stopping ? "Stopping…" : "Stop current"}
        </button>
      </form>

      {latest.message && (
        <p
          role="status"
          className={
            latest.status === "error"
              ? "rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
              : "rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
          }
        >
          {latest.message}
        </p>
      )}

      <details className="text-sm text-zinc-600 dark:text-zinc-400">
        <summary className="cursor-pointer select-none">Accepted formats</summary>
        <ul className="mt-2 space-y-1 font-mono text-xs">
          {formats.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
