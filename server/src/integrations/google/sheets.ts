import { config } from "../../config/index.js";
import { googleLogger } from "../../utils/logger.js";
import { getSheets, withRetry } from "./client.js";

/**
 * Sheets access layer.
 *
 * The read-only guarantee for the two source sheets is enforced here in code,
 * not left to discipline: `assertWritable` refuses any write whose spreadsheet
 * ID matches a source sheet. Doc 06 states the rule three times — "never
 * modify, never delete, never append" — so it deserves a real guard.
 */

/** IDs the application must never write to, under any circumstances. */
function readOnlyIds(): string[] {
  return [config.google.sourceSheet1Id, config.google.sourceSheet2Id].filter(
    (id): id is string => Boolean(id),
  );
}

export class SourceSheetWriteError extends Error {
  constructor(spreadsheetId: string) {
    super(
      `Refused to write to source spreadsheet ${spreadsheetId}. ` +
        `Source sheets are read-only; all writes belong in TMS Master.`,
    );
    this.name = "SourceSheetWriteError";
  }
}

function assertWritable(spreadsheetId: string): void {
  if (readOnlyIds().includes(spreadsheetId)) {
    throw new SourceSheetWriteError(spreadsheetId);
  }
}

/** Metadata for every tab in a spreadsheet. */
export interface TabInfo {
  title: string;
  sheetId: number;
  rowCount: number;
  columnCount: number;
}

export async function listTabs(spreadsheetId: string): Promise<TabInfo[]> {
  const sheets = getSheets();
  const response = await withRetry(
    () => sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" }),
    config.sync.retryAttempts,
    `listTabs ${spreadsheetId}`,
  );

  return (response.data.sheets ?? []).map((sheet) => ({
    title: sheet.properties?.title ?? "",
    sheetId: sheet.properties?.sheetId ?? 0,
    rowCount: sheet.properties?.gridProperties?.rowCount ?? 0,
    columnCount: sheet.properties?.gridProperties?.columnCount ?? 0,
  }));
}

/**
 * Read one range as a raw grid.
 *
 * FORMATTED_VALUE is used deliberately: it returns dates and amounts as the
 * operator typed them ("4-Sep-2025", "$1,420.00"), which is exactly what the
 * normalization layer in @tms/shared expects. Serial numbers would lose the
 * operator's intent and hide data-entry faults we need to surface.
 */
export async function readRange(
  spreadsheetId: string,
  range: string,
): Promise<string[][]> {
  const sheets = getSheets();
  const response = await withRetry(
    () =>
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
        valueRenderOption: "FORMATTED_VALUE",
        dateTimeRenderOption: "FORMATTED_STRING",
      }),
    config.sync.retryAttempts,
    `readRange ${range}`,
  );

  return (response.data.values ?? []) as string[][];
}

/**
 * Read several ranges in ONE request.
 *
 * This is the primary read path. With TMS Master as the sole store and no
 * local database, a batched read per sync is what keeps Sheets API quota flat
 * regardless of how many users or agents are active.
 */
export async function readRanges(
  spreadsheetId: string,
  ranges: string[],
): Promise<Record<string, string[][]>> {
  if (ranges.length === 0) return {};

  const sheets = getSheets();
  const response = await withRetry(
    () =>
      sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges,
        valueRenderOption: "FORMATTED_VALUE",
        dateTimeRenderOption: "FORMATTED_STRING",
      }),
    config.sync.retryAttempts,
    `readRanges (${ranges.length})`,
  );

  const result: Record<string, string[][]> = {};
  (response.data.valueRanges ?? []).forEach((valueRange, index) => {
    result[ranges[index]] = (valueRange.values ?? []) as string[][];
  });
  return result;
}

/** Overwrite a range in TMS Master. Refuses source-sheet IDs. */
export async function writeRange(
  spreadsheetId: string,
  range: string,
  values: (string | number | null)[][],
): Promise<number> {
  assertWritable(spreadsheetId);

  const sheets = getSheets();
  await withRetry(
    () =>
      sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: "RAW",
        requestBody: { values },
      }),
    config.sync.retryAttempts,
    `writeRange ${range}`,
  );

  googleLogger.debug({ range, rows: values.length }, "wrote range");
  return values.length;
}

/** Append rows to a tab in TMS Master. Refuses source-sheet IDs. */
export async function appendRows(
  spreadsheetId: string,
  range: string,
  values: (string | number | null)[][],
): Promise<number> {
  assertWritable(spreadsheetId);
  if (values.length === 0) return 0;

  const sheets = getSheets();
  await withRetry(
    () =>
      sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values },
      }),
    config.sync.retryAttempts,
    `appendRows ${range}`,
  );

  return values.length;
}

/** Create a tab if it does not already exist. TMS Master only. */
export async function ensureTab(
  spreadsheetId: string,
  title: string,
): Promise<void> {
  assertWritable(spreadsheetId);

  const existing = await listTabs(spreadsheetId);
  if (existing.some((tab) => tab.title === title)) return;

  const sheets = getSheets();
  await withRetry(
    () =>
      sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title } } }] },
      }),
    config.sync.retryAttempts,
    `ensureTab ${title}`,
  );

  googleLogger.info({ title }, "created TMS Master tab");
}
