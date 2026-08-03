import { googleLogger } from "../../utils/logger.js";

/**
 * Credential-free source reader.
 *
 * Reads the link-shared source spreadsheets through Google's CSV export
 * endpoint. This is READ ONLY by construction — an export URL cannot mutate
 * anything — which suits sheets that must never be written to.
 *
 * This is a deliberate interim adapter. Once a service account exists,
 * `sheets.ts` replaces it behind the same `SourceReader` interface and no
 * caller changes.
 */

export interface SourceTab {
  gid: string;
  title: string;
}

export interface SourceReader {
  listTabs(spreadsheetId: string): Promise<SourceTab[]>;
  readTab(spreadsheetId: string, gid: string): Promise<string[][]>;
}

/* ---------------- CSV ---------------- */

/** RFC 4180 — quoted fields, embedded commas and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += char;
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/* ---------------- Reader ---------------- */

export class CsvSourceReader implements SourceReader {
  /**
   * Tab list scraped from the spreadsheet's own HTML, since the Sheets API
   * needs auth. Fragile by nature and replaced by `listTabs()` in the
   * authenticated adapter — but it means new monthly tabs are picked up
   * automatically rather than being hardcoded.
   */
  async listTabs(spreadsheetId: string): Promise<SourceTab[]> {
    const response = await fetch(
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/htmlview`,
      { redirect: "follow" },
    );
    if (!response.ok) {
      throw new SourceUnavailableError(
        `Could not list tabs (HTTP ${response.status}). Is the sheet still link-shared?`,
      );
    }

    const html = await response.text();
    const found = new Map<string, string>();

    for (const match of html.matchAll(
      /id="sheet-button-(\d+)"[^>]*>(?:<[^>]+>)*([^<]{1,60})</g,
    )) {
      found.set(match[1], decodeEntities(match[2].trim()));
    }

    if (found.size === 0) {
      for (const match of html.matchAll(/[?&]gid=(\d+)/g)) {
        if (!found.has(match[1])) found.set(match[1], `Tab ${match[1]}`);
      }
    }

    return [...found].map(([gid, title]) => ({ gid, title }));
  }

  async readTab(spreadsheetId: string, gid: string): Promise<string[][]> {
    const url =
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}` +
      `/export?format=csv&gid=${gid}`;

    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) {
      throw new SourceUnavailableError(
        `Could not read tab ${gid} (HTTP ${response.status}).`,
      );
    }

    const text = await response.text();
    if (text.trimStart().startsWith("<")) {
      throw new SourceUnavailableError(
        `Tab ${gid} returned HTML rather than CSV — the sheet is no longer link-shared.`,
      );
    }

    const rows = parseCsv(text);
    googleLogger.debug({ gid, rows: rows.length }, "read source tab");
    return rows;
  }
}

export class SourceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceUnavailableError";
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/* ---------------- Header mapping ---------------- */

/**
 * Map a row array to fields by HEADER NAME, never by position.
 *
 * Essential here: Source Sheet 1's monthly tabs carry 18–21 columns as fields
 * were added over time, so column index means different things in different
 * tabs. Matching on the header is what lets one mapper read all 14.
 */
export function buildHeaderIndex(
  headerRow: string[],
  aliases: Record<string, string[]>,
): Map<string, number> {
  const index = new Map<string, number>();

  headerRow.forEach((raw, position) => {
    const header = raw.replace(/[\r\n\t]/g, " ").trim().toLowerCase();
    if (!header) return;

    for (const [field, candidates] of Object.entries(aliases)) {
      if (index.has(field)) continue;
      if (candidates.some((c) => c.toLowerCase() === header)) {
        index.set(field, position);
        return;
      }
    }
  });

  return index;
}

export function cell(
  row: string[],
  index: Map<string, number>,
  field: string,
): string | null {
  const position = index.get(field);
  if (position === undefined) return null;
  const value = row[position];
  return value === undefined || value === "" ? null : value;
}
