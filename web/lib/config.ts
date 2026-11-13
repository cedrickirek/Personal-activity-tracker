import "server-only";

// Settings come from environment variables: `web/.env.local` on my laptop,
// the project's Environment Variables on Vercel. `server-only` makes the
// build fail if this file is ever imported into code sent to the browser.

export class ConfigError extends Error {}

export type Config = {
  appPassword: string;
  sessionSecret: string;
  sheetId: string;
  serviceAccountEmail: string;
  privateKey: string;
  activitiesTab: string;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new ConfigError(`${name} is not set. Add it to web/.env.local, or to the Vercel project's Environment Variables.`);
  return value;
}

export function getConfig(): Config {
  const sessionSecret = required("SESSION_SECRET");
  if (sessionSecret.length < 32) {
    throw new ConfigError("SESSION_SECRET must be at least 32 characters (a long random string).");
  }
  return {
    appPassword: required("APP_PASSWORD"),
    sessionSecret,
    sheetId: required("SHEET_ID"),
    serviceAccountEmail: required("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    // The key has line breaks. Pasted into one line, they arrive as the two
    // characters "\n"; turn them back into real line breaks.
    privateKey: required("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    // Local development writes to a separate tab, so tests don't mix with my
    // real days (see .env.example).
    activitiesTab: process.env.ACTIVITIES_TAB?.trim() || "Activities",
  };
}
