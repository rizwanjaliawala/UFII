/**
 * CSV generation.
 *
 * Excel is the destination for every export this application produces, and it
 * is unusually particular:
 *
 *  - Without a UTF-8 BOM it reads the file as the system codepage, so vendor
 *    names with accented characters arrive mangled. The same class of bug the
 *    project already hit once when PowerShell rewrote source files.
 *  - A leading `=`, `+`, `-` or `@` makes Excel treat the cell as a formula.
 *    A container reference beginning with `-` would be evaluated, and a
 *    hostile value could become a command. Prefixing with a tab neutralises
 *    it while still displaying the original text.
 *  - Line endings must be CRLF for older Excel builds to split rows.
 */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

const RISKY_PREFIX = /^[=+\-@\t\r]/;

function escapeCell(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "";

  let value = String(raw);
  // Neutralise formula injection before quoting, not after — otherwise the
  // added quote hides the leading character from this check.
  if (RISKY_PREFIX.test(value)) value = `\t${value}`;

  if (/[",\r\n]/.test(value)) {
    return `"${value.split('"').join('""')}"`;
  }
  return value;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => escapeCell(c.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCell(c.value(row))).join(","));
  }
  // The BOM must lead the file, before the header row.
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** `utopia-containers-2026-08-02.csv` — sorts chronologically in a folder. */
export function exportFilename(prefix: string, now = new Date()): string {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  return `utopia-${prefix}-${day}.csv`;
}
