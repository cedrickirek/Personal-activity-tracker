"use client";

import { useActionState } from "react";
import { login, type FormState } from "../actions";

const initial: FormState = { status: "idle", message: "", text: "", at: 0 };

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initial);
  return (
    <form action={action} className="space-y-3">
      <input
        type="password"
        name="password"
        aria-label="Password"
        placeholder="Password"
        autoComplete="current-password"
        required
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-3 text-base text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-zinc-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Checking…" : "Log in"}
      </button>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {state.message}
        </p>
      )}
    </form>
  );
}
