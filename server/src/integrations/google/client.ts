import { google } from "googleapis";
import type { sheets_v4, drive_v3 } from "googleapis";
import { config } from "../../config/index.js";
import { googleLogger } from "../../utils/logger.js";

/**
 * Google API client.
 *
 * Scopes are deliberately split: Drive is read-only, and Sheets write access
 * exists solely so the Synchronization Engine can update TMS Master. The
 * source sheets are never written — that rule is enforced in `sheets.ts` by
 * refusing writes to their IDs, not merely by convention.
 */

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.readonly",
];

export class GoogleNotConfiguredError extends Error {
  constructor() {
    super(
      "Google integration is not configured. Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE " +
        "(or GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY) in the environment, and " +
        "share both source sheets and TMS Master with the service account address.",
    );
    this.name = "GoogleNotConfiguredError";
  }
}

let sheetsClient: sheets_v4.Sheets | null = null;
let driveClient: drive_v3.Drive | null = null;

function auth() {
  if (!config.google.configured) throw new GoogleNotConfiguredError();

  return config.google.keyFile
    ? new google.auth.GoogleAuth({ keyFile: config.google.keyFile, scopes: SCOPES })
    : new google.auth.GoogleAuth({
        credentials: {
          client_email: config.google.clientEmail,
          private_key: config.google.privateKey,
        },
        scopes: SCOPES,
      });
}

export function getSheets(): sheets_v4.Sheets {
  if (!sheetsClient) {
    sheetsClient = google.sheets({ version: "v4", auth: auth() });
    googleLogger.debug("Sheets client initialised");
  }
  return sheetsClient;
}

export function getDrive(): drive_v3.Drive {
  if (!driveClient) {
    driveClient = google.drive({ version: "v3", auth: auth() });
    googleLogger.debug("Drive client initialised");
  }
  return driveClient;
}

/**
 * Retry with exponential backoff for the failures Google actually produces
 * transiently — rate limits and 5xx. Permission and not-found errors are
 * permanent and are surfaced immediately rather than retried (doc 10
 * §Error Recovery).
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  attempts = 3,
  label = "google call",
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const status = (error as { code?: number; status?: number })?.code ?? 0;
      const transient = status === 429 || (status >= 500 && status < 600);

      if (!transient || attempt === attempts) break;

      const delayMs = 2 ** (attempt - 1) * 500;
      googleLogger.warn(
        { label, attempt, status, delayMs },
        "transient Google failure, retrying",
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
