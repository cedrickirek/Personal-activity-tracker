import "server-only";

// The login's Next.js wiring: reading and setting the session cookie.
// Every page and every server action calls requireLogin(), because server
// actions can be called by anyone who sends a POST request, not only through
// the page.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getConfig } from "./config";
import { SESSION_DAYS, createSessionToken, isValidSessionToken } from "./session";

const COOKIE_NAME = "tracker_session";

export async function isLoggedIn(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return isValidSessionToken(token, getConfig().sessionSecret, Date.now());
}

export async function requireLogin(): Promise<void> {
  if (!(await isLoggedIn())) redirect("/login");
}

export async function startSession(): Promise<void> {
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  (await cookies()).set(COOKIE_NAME, createSessionToken(expiresAt, getConfig().sessionSecret), {
    httpOnly: true, // page scripts can't read it
    secure: process.env.NODE_ENV === "production", // HTTPS only, except on localhost
    sameSite: "lax", // not sent with requests started by other sites
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}
