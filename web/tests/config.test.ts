import { afterEach, describe, expect, it } from "vitest";
import { configProblem, getConfig } from "@/lib/config";

const VALID = {
  APP_PASSWORD: "a long password",
  SESSION_SECRET: "s".repeat(64),
  SHEET_ID: "sheet-id",
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "robot@example.iam.gserviceaccount.com",
  GOOGLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n",
};
const saved = { ...process.env };

function setEnv(values: Record<string, string | undefined>) {
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

afterEach(() => {
  process.env = { ...saved };
});

describe("setup problems", () => {
  it("none when every setting is there", () => {
    setEnv({ ...VALID, ACTIVITIES_TAB: undefined });
    expect(configProblem()).toBeNull();
    expect(getConfig().activitiesTab).toBe("Activities");
  });

  it("names the missing setting, as the first deployment needed", () => {
    setEnv({ ...VALID, APP_PASSWORD: undefined, APP_PASSSWORD: "typo" });
    expect(configProblem()).toContain("APP_PASSWORD is not set");
  });

  it("treats a blank value as missing", () => {
    setEnv({ ...VALID, SHEET_ID: "   " });
    expect(configProblem()).toContain("SHEET_ID is not set");
  });

  it("asks for a long SESSION_SECRET", () => {
    setEnv({ ...VALID, SESSION_SECRET: "short" });
    expect(configProblem()).toContain("at least 32 characters");
  });

  it("restores the line breaks of a key pasted on one line", () => {
    setEnv(VALID);
    expect(getConfig().privateKey).toBe("-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n");
  });
});
