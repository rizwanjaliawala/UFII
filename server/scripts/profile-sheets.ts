/**
 * Source sheet profiler.
 *
 * Reads the source spreadsheets and writes a factual schema report to
 * docs/_generated/. Doc 12 lists "expected fields"; this reports what is
 * actually there, so the sync engine is built against reality.
 *
 * Uses Google's CSV export endpoint, which works for link-shared sheets with
 * no credentials. That makes this runnable today, before a service account
 * exists. It is READ ONLY by construction — an export URL cannot mutate
 * anything.
 *
 *   npm run profile:sheets
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  normalizeAmount,
  normalizeContainerNumber,
  normalizeDate,
  normalizeNullable,
  isValidContainerNumber,
} from "@tms/shared";

interface TabTarget {
  label: string;
  spreadsheetId: string;
  gid: string;
}

// IDs come from the environment — never committed. The sheets are shared
// "anyone with the link", so an ID in source publishes the data itself.
const SPREADSHEETS = [
  {
    label: "Source Sheet 1 — Floor-Loaded (USA)",
    id: process.env.SOURCE_SHEET_1_ID,
  },
  {
    label: "Source Sheet 2 — Detention",
    id: process.env.SOURCE_SHEET_2_ID,
  },
].filter((sheet): sheet is { label: string; id: string } => {
  if (!sheet.id) {
    console.error(
      `Missing sheet ID for "${sheet.label}". ` +
        `Set SOURCE_SHEET_1_ID and SOURCE_SHEET_2_ID in server/.env.`,
    );
    return false;
  }
  return true;
});

/**
 * Discover every tab without credentials.
 *
 * The Sheets API would need auth, so this scrapes the tab list out of the
 * spreadsheet's own HTML. Fragile by nature — once a service account exists,
 * `listTabs()` in the sheets adapter replaces this entirely.
 */
async function discoverTabs(
  spreadsheetId: string,
): Promise<{ gid: string; title: string }[]> {
  const response = await fetch(
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/htmlview`,
    { redirect: "follow" },
  );
  if (!response.ok) return [];

  const html = await response.text();
  const found = new Map<string, string>();

  // Tab anchors look like: id="sheet-button-<gid>" ...>Title</a>
  for (const match of html.matchAll(
    /id="sheet-button-(\d+)"[^>]*>(?:<[^>]+>)*([^<]{1,60})</g,
  )) {
    found.set(match[1], match[2].trim());
  }

  // Fallback: bare gid references, titled later by position.
  if (found.size === 0) {
    for (const match of html.matchAll(/[?&]gid=(\d+)/g)) {
      if (!found.has(match[1])) found.set(match[1], `gid ${match[1]}`);
    }
  }

  return [...found].map(([gid, title]) => ({ gid, title }));
}

/* ---------------- CSV parsing ---------------- */

/** RFC 4180 parser — handles quoted fields, embedded commas and newlines. */
function parseCsv(text: string): string[][] {
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
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
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
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function fetchCsv(target: TabTarget): Promise<string[][]> {
  const url =
    `https://docs.google.com/spreadsheets/d/${target.spreadsheetId}` +
    `/export?format=csv&gid=${target.gid}`;

  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} — is the sheet still shared with "anyone with the link"?`,
    );
  }

  const text = await response.text();
  if (text.trimStart().startsWith("<")) {
    throw new Error("Received HTML rather than CSV — the sheet is not link-shared.");
  }
  return parseCsv(text);
}

/* ---------------- Profiling ---------------- */

type InferredType = "container" | "date" | "money" | "integer" | "text" | "empty";

interface ColumnProfile {
  index: number;
  header: string;
  filled: number;
  fillRate: string;
  distinct: number;
  inferred: InferredType;
  samples: string[];
  anomalies: string[];
}

function inferType(values: string[]): InferredType {
  if (values.length === 0) return "empty";

  const score = { container: 0, date: 0, money: 0, integer: 0 };
  for (const value of values) {
    const normalized = normalizeContainerNumber(value);
    if (normalized && isValidContainerNumber(normalized)) score.container++;
    if (normalizeDate(value)) score.date++;
    if (/[$,]/.test(value) && normalizeAmount(value) !== null) score.money++;
    else if (/^\d+$/.test(value.trim())) score.integer++;
  }

  const threshold = values.length * 0.7;
  if (score.container >= threshold) return "container";
  if (score.date >= threshold) return "date";
  if (score.money >= threshold) return "money";
  if (score.integer >= threshold) return "integer";
  return "text";
}

/** Faults that would corrupt the merge if carried through unnormalised. */
function findAnomalies(header: string, raw: string[], type: InferredType): string[] {
  const issues: string[] = [];

  const withControlChars = raw.filter((v) => /[\r\n\t]|&#13;/.test(v)).length;
  if (withControlChars > 0) {
    issues.push(`${withControlChars} values contain carriage returns/newlines`);
  }

  const withPadding = raw.filter((v) => v !== v.trim()).length;
  if (withPadding > 0) issues.push(`${withPadding} values have leading/trailing space`);

  const nullTokens = raw.filter((v) => ["-", "--", "N/A", "n/a"].includes(v.trim())).length;
  if (nullTokens > 0) issues.push(`${nullTokens} values use a placeholder for null`);

  if (type === "container") {
    const invalid = raw.filter((v) => {
      const n = normalizeContainerNumber(v);
      return n !== null && !isValidContainerNumber(n);
    });
    if (invalid.length > 0) {
      issues.push(
        `${invalid.length} do not match ISO 6346 (e.g. ${invalid.slice(0, 2).join(", ")})`,
      );
    }
  }

  if (type === "date") {
    const unparseable = raw.filter((v) => normalizeDate(v) === null);
    if (unparseable.length > 0) {
      issues.push(
        `${unparseable.length} unparseable (e.g. ${unparseable.slice(0, 2).join(", ")})`,
      );
    }
    const future = raw
      .map((v) => normalizeDate(v))
      .filter((d): d is string => d !== null)
      .filter((d) => new Date(d) > new Date(Date.now() + 365 * 86_400_000));
    if (future.length > 0) {
      issues.push(`${future.length} dated more than a year ahead — probable year typo`);
    }
  }

  if (header.trim() !== header) issues.push("header itself has padding");
  return issues;
}

function profileTab(rows: string[][]): {
  headers: string[];
  dataRows: number;
  columns: ColumnProfile[];
} {
  if (rows.length === 0) return { headers: [], dataRows: 0, columns: [] };

  const headers = rows[0].map((h) => h.trim());
  const body = rows.slice(1).filter((r) => r.some((c) => normalizeNullable(c) !== null));

  const columns = headers.map((header, index) => {
    const raw = body.map((r) => r[index] ?? "");
    const filled = raw.filter((v) => normalizeNullable(v) !== null);
    const cleaned = filled.map((v) => normalizeNullable(v)!);
    const type = inferType(cleaned);

    return {
      index,
      header: header || `(unnamed col ${index + 1})`,
      filled: filled.length,
      fillRate: body.length ? `${Math.round((filled.length / body.length) * 100)}%` : "0%",
      distinct: new Set(cleaned).size,
      inferred: type,
      samples: [...new Set(cleaned)].slice(0, 3),
      anomalies: findAnomalies(header, filled, type),
    } satisfies ColumnProfile;
  });

  return { headers, dataRows: body.length, columns };
}

/* ---------------- Report ---------------- */

async function main(): Promise<void> {
  const lines: string[] = [
    "# Source Sheet Schema Profile",
    "",
    "> Generated by `npm run profile:sheets`. Reports what the sheets actually",
    "> contain, as opposed to the expected fields listed in doc 12.",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
  ];

  const summary: string[] = [];

  // Expand each spreadsheet into its tabs.
  const targets: TabTarget[] = [];
  for (const sheet of SPREADSHEETS) {
    const tabs = await discoverTabs(sheet.id);
    if (tabs.length === 0) {
      console.warn(`  ! could not discover tabs for ${sheet.label}; using default tab`);
      targets.push({ label: `${sheet.label} — (default tab)`, spreadsheetId: sheet.id, gid: "0" });
      continue;
    }
    console.log(`  ${sheet.label}: ${tabs.length} tab(s)`);
    for (const tab of tabs) {
      targets.push({
        label: `${sheet.label} → "${tab.title}"`,
        spreadsheetId: sheet.id,
        gid: tab.gid,
      });
    }
  }

  for (const target of targets) {
    console.log(`Reading ${target.label}…`);
    lines.push(`\n---\n\n## ${target.label}\n`);

    try {
      const rows = await fetchCsv(target);
      const { dataRows, columns } = profileTab(rows);

      summary.push(`${target.label}: ${dataRows} rows, ${columns.length} columns`);

      lines.push(`**Rows:** ${dataRows}  |  **Columns:** ${columns.length}\n`);
      lines.push("| # | Header | Type | Fill | Distinct | Samples |");
      lines.push("|---|---|---|---|---|---|");

      for (const c of columns) {
        const samples = c.samples.map((s) => `\`${s.slice(0, 22)}\``).join(", ") || "—";
        lines.push(
          `| ${c.index + 1} | ${c.header} | ${c.inferred} | ${c.fillRate} | ${c.distinct} | ${samples} |`,
        );
      }

      const flagged = columns.filter((c) => c.anomalies.length > 0);
      if (flagged.length > 0) {
        lines.push("\n### Data quality findings\n");
        for (const c of flagged) {
          lines.push(`**${c.header}**`);
          for (const issue of c.anomalies) lines.push(`- ${issue}`);
          lines.push("");
        }
        summary.push(`  ${flagged.length} columns with data-quality findings`);
      }
    } catch (error) {
      const message = (error as Error).message;
      lines.push(`> **Could not read this sheet.** ${message}\n`);
      summary.push(`${target.label}: FAILED — ${message}`);
    }
  }

  const outDir = join(process.cwd(), "..", "docs", "_generated");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "source-sheet-profile.md");
  writeFileSync(outPath, lines.join("\n"), "utf8");

  console.log("\n" + summary.join("\n"));
  console.log(`\nReport written to docs/_generated/source-sheet-profile.md`);
}

main().catch((error) => {
  console.error("Profiling failed:", (error as Error).message);
  process.exit(1);
});
