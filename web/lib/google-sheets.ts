import "server-only";

// The Google-specific half of the storage: a SheetGrid (see store.ts) backed
// by the Google Sheets API, logged in as the service account. Runs only on the
// server; the private key never reaches the browser.

import { auth, sheets, type sheets_v4 } from "@googleapis/sheets";
import { ConfigError, getConfig } from "./config";
import { ActivityStore, type SheetGrid } from "./store";
import { ACTIVITY_COLUMNS } from "./activity";

// Least privilege: Sheets only, no Google Drive. The app opens the Sheet by its ID.
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const LAST_COLUMN = String.fromCharCode("A".charCodeAt(0) + ACTIVITY_COLUMNS.length - 1); // "L"

class GoogleSheetGrid implements SheetGrid {
  private tabReady: Promise<void> | null = null;

  constructor(
    private readonly api: sheets_v4.Sheets,
    private readonly sheetId: string,
    private readonly tab: string,
  ) {}

  // Quotes let a tab name contain spaces or dashes ("Activities-dev").
  private range(cells: string): string {
    return `'${this.tab.replace(/'/g, "''")}'!${cells}`;
  }

  async readAll(): Promise<string[][]> {
    await this.ensureTab();
    const response = await this.api.spreadsheets.values
      .get({ spreadsheetId: this.sheetId, range: this.range(`A:${LAST_COLUMN}`) })
      .catch((error) => Promise.reject(explain(error)));
    return (response.data.values ?? []).map((row) => row.map((cell) => String(cell ?? "")));
  }

  async appendRow(values: string[]): Promise<void> {
    await this.api.spreadsheets.values
      .append({
        spreadsheetId: this.sheetId,
        range: this.range("A1"),
        // RAW: the Sheet stores exactly this text. Otherwise "09:30" becomes a
        // time value, "2026-11-13" a date, and anything starting with "=" a
        // formula (formula injection).
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [values] },
      })
      .catch((error) => Promise.reject(explain(error)));
  }

  async writeRow(rowNumber: number, values: string[]): Promise<void> {
    await this.api.spreadsheets.values
      .update({
        spreadsheetId: this.sheetId,
        range: this.range(`A${rowNumber}:${LAST_COLUMN}${rowNumber}`),
        valueInputOption: "RAW",
        requestBody: { values: [values] },
      })
      .catch((error) => Promise.reject(explain(error)));
  }

  /** Creates the tab if it doesn't exist yet (e.g. the local "Activities-dev"). */
  private ensureTab(): Promise<void> {
    this.tabReady ??= (async () => {
      const meta = await this.api.spreadsheets.get({
        spreadsheetId: this.sheetId,
        fields: "sheets.properties.title",
      });
      const titles = (meta.data.sheets ?? []).map((s) => s.properties?.title);
      if (!titles.includes(this.tab)) {
        await this.api.spreadsheets.batchUpdate({
          spreadsheetId: this.sheetId,
          requestBody: { requests: [{ addSheet: { properties: { title: this.tab } } }] },
        });
      }
    })().catch((error) => {
      this.tabReady = null; // let the next request try again
      throw explain(error);
    });
    return this.tabReady;
  }
}

/**
 * Turns Google's setup errors into a sentence saying what to fix, the same
 * cases as v1 (see mistakes/2026-11-12-sheet-refused-the-service-account.md).
 */
function explain(error: unknown): Error {
  if (error instanceof ConfigError) return error;
  const e = error as { status?: number; code?: number | string; response?: { status?: number } };
  const status = e.response?.status ?? e.status ?? Number(e.code);
  const message = error instanceof Error ? error.message : String(error);
  if (status === 404) return new ConfigError("No spreadsheet has that SHEET_ID. Check the ID in the Sheet's URL.");
  if (status === 403 && /has not been used|disabled/i.test(message)) {
    return new ConfigError("The Google Sheets API is switched off for the service account's project. Enable it in Google Cloud.");
  }
  if (status === 403) {
    return new ConfigError("The service account can't open the Sheet. Share the Sheet with its email address as Editor.");
  }
  if (/invalid_grant|DECODER|PEM|private key/i.test(message)) {
    return new ConfigError("GOOGLE_PRIVATE_KEY or GOOGLE_SERVICE_ACCOUNT_EMAIL is wrong. Paste them again from the service account key.");
  }
  return error instanceof Error ? error : new Error(message);
}

// One store per server instance: the Google login is reused between requests
// instead of being redone on every click.
let store: ActivityStore | null = null;

export function getStore(): ActivityStore {
  if (store) return store;
  const config = getConfig();
  const client = new auth.JWT({
    email: config.serviceAccountEmail,
    key: config.privateKey,
    scopes: SCOPES,
  });
  const api = sheets({ version: "v4", auth: client });
  store = new ActivityStore(new GoogleSheetGrid(api, config.sheetId, config.activitiesTab));
  return store;
}
