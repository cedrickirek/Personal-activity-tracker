// The login, without the Next.js parts (those are in auth.ts), so it can be
// tested directly.
//
// After the right password, the browser gets a cookie that says "logged in
// until <date>", plus a signature: an HMAC of that date computed with
// SESSION_SECRET, which only the server knows. Changing the date in the cookie
// breaks the signature, so the cookie can't be forged or extended. Changing
// SESSION_SECRET logs every device out.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_DAYS = 30;

function sign(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

export function createSessionToken(expiresAt: number, secret: string): string {
  return `${expiresAt}.${sign(String(expiresAt), secret).toString("base64url")}`;
}

export function isValidSessionToken(token: string | undefined, secret: string, now: number): boolean {
  if (!token) return false;
  const [expires, signature] = token.split(".");
  if (!/^\d+$/.test(expires ?? "") || !signature) return false;
  const expected = sign(expires, secret);
  const given = Buffer.from(signature, "base64url");
  // timingSafeEqual takes the same time whether the first or the last byte
  // differs, so the response time doesn't leak how close a guess was.
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  return Number(expires) > now;
}

/** Compares passwords in constant time (hashing first makes the lengths equal). */
export function passwordMatches(given: string, expected: string): boolean {
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(given), hash(expected));
}
