"use server";

// Server actions: what the page's forms call. Each one checks the login
// first, because an action can be called by any POST request, not only by
// the page. They wire things together; the rules live in lib/.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { endSession, requireLogin, startSession } from "@/lib/auth";
import { configProblem, getConfig } from "@/lib/config";
import { getStore } from "@/lib/google-sheets";
import { parseEntry } from "@/lib/parse";
import { planEntry, planStop } from "@/lib/periods";
import { passwordMatches } from "@/lib/session";
import { parisNow } from "@/lib/time";

export type FormState = {
  status: "idle" | "ok" | "error";
  message: string;
  /** What was typed, to put it back in the box after an error. */
  text: string;
  /** Changes on every answer, so the page knows which message is the latest. */
  at: number;
};

export async function login(_previous: FormState, formData: FormData): Promise<FormState> {
  const problem = configProblem();
  if (problem) return { status: "error", message: problem, text: "", at: Date.now() };
  const password = String(formData.get("password") ?? "");
  if (!passwordMatches(password, getConfig().appPassword)) {
    // Slows down anyone trying passwords one after another.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { status: "error", message: "Wrong password.", text: "", at: Date.now() };
  }
  await startSession();
  redirect("/");
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/login");
}

function failure(error: unknown, text: string): FormState {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return { status: "error", message, text, at: Date.now() };
}

export async function logEntry(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireLogin();
  const text = String(formData.get("entry") ?? "");
  try {
    const now = parisNow();
    const parsed = parseEntry(text, now.date);
    if (!parsed.ok) return { status: "error", message: parsed.error, text, at: Date.now() };

    const store = getStore();
    const plan = planEntry(await store.list(), parsed.entry, text.trim(), now);
    if (!plan.ok) return { status: "error", message: plan.error, text, at: Date.now() };

    // Close or shorten the activities this entry interrupts, then add it.
    for (const update of plan.updates) await store.update(update.id, update.fields);
    await store.add(plan.newRow, now.iso);

    revalidatePath("/");
    return { status: "ok", message: plan.message, text: "", at: Date.now() };
  } catch (error) {
    return failure(error, text);
  }
}

export async function stopCurrent(): Promise<FormState> {
  await requireLogin();
  try {
    const store = getStore();
    const plan = planStop(await store.list(), parisNow());
    for (const update of plan.updates) await store.update(update.id, update.fields);
    revalidatePath("/");
    return { status: plan.updates.length ? "ok" : "error", message: plan.message, text: "", at: Date.now() };
  } catch (error) {
    return failure(error, "");
  }
}
