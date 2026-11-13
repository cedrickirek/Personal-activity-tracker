import { describe, expect, it } from "vitest";
import { createSessionToken, isValidSessionToken, passwordMatches } from "@/lib/session";

const SECRET = "a".repeat(40);
const NOW = 1_800_000_000_000;

describe("session token", () => {
  it("is valid until it expires", () => {
    const token = createSessionToken(NOW + 1000, SECRET);
    expect(isValidSessionToken(token, SECRET, NOW)).toBe(true);
    expect(isValidSessionToken(token, SECRET, NOW + 1000)).toBe(false);
  });

  it("can't be extended by editing the date", () => {
    const [, signature] = createSessionToken(NOW + 1000, SECRET).split(".");
    expect(isValidSessionToken(`${NOW + 999_999_999}.${signature}`, SECRET, NOW)).toBe(false);
  });

  it("is invalid once SESSION_SECRET changes", () => {
    const token = createSessionToken(NOW + 1000, SECRET);
    expect(isValidSessionToken(token, "b".repeat(40), NOW)).toBe(false);
  });

  it.each([undefined, "", "garbage", "123", "123.", ".abc", "abc.def"])("rejects %j", (token) => {
    expect(isValidSessionToken(token, SECRET, NOW)).toBe(false);
  });
});

describe("password", () => {
  it("matches only the exact password", () => {
    expect(passwordMatches("correct horse", "correct horse")).toBe(true);
    expect(passwordMatches("correct hors", "correct horse")).toBe(false);
    expect(passwordMatches("", "correct horse")).toBe(false);
  });
});
