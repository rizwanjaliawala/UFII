import { Router } from "express";
import { z } from "zod";
import { canonicalVendorName } from "@tms/shared";
import { config } from "../config/index.js";
import { query } from "../db/pool.js";
import { getContainerRepository } from "../repositories/containerRepository.js";

export const searchRouter = Router();

/**
 * Global search (doc 03 §Global Search) — the Ctrl+K palette.
 *
 * Spans containers, vendors and invoices in one call. Each group is capped
 * hard: this is a jump-to, not a report. An operator who wants the full list
 * uses Container Search, and the palette says so when it truncates.
 *
 * Every group is queried concurrently and a failing group degrades to empty
 * rather than failing the whole palette — a broken invoice lookup should not
 * stop somebody jumping to a container.
 */

const MAX_PER_GROUP = 6;

const schema = z.object({ q: z.string().trim().min(2).max(60) });

export interface SearchHit {
  kind: "container" | "vendor" | "invoice";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

searchRouter.get("/", async (req, res, next) => {
  try {
    const parsed = schema.safeParse(req.query);
    // Under two characters every query matches, which is noise rather than a
    // result — answer with an empty palette instead of an error.
    if (!parsed.success) return res.json({ q: "", hits: [], truncated: false });

    const { q } = parsed.data;
    const repository = await getContainerRepository();

    const [containers, vendors, invoices] = await Promise.all([
      searchContainers(repository, q),
      searchVendors(repository, q),
      searchInvoices(q),
    ]);

    res.json({
      q,
      hits: [...containers.hits, ...vendors, ...invoices],
      truncated: containers.truncated,
    });
  } catch (error) {
    next(error);
  }
});

async function searchContainers(
  repository: Awaited<ReturnType<typeof getContainerRepository>>,
  q: string,
): Promise<{ hits: SearchHit[]; truncated: boolean }> {
  const { rows, total } = await repository.search({
    q,
    sort: "urgency",
    direction: "asc",
    page: 1,
    pageSize: MAX_PER_GROUP,
  });

  return {
    truncated: total > rows.length,
    hits: rows.map((c) => ({
      kind: "container" as const,
      id: c.containerNumber,
      title: c.containerNumber,
      subtitle: [c.status, c.trucker, c.terminal].filter(Boolean).join(" · "),
      href: `/containers/${c.containerNumber}`,
    })),
  };
}

async function searchVendors(
  repository: Awaited<ReturnType<typeof getContainerRepository>>,
  q: string,
): Promise<SearchHit[]> {
  const needle = q.toLowerCase();
  const { truckers } = await repository.filterOptions();

  // Merge spelling variants before matching, so typing "S&P" surfaces one
  // vendor rather than the two rows the source sheets contain.
  const merged = new Map<string, number>();
  for (const option of truckers) {
    const name = canonicalVendorName(option.value) ?? option.value;
    merged.set(name, (merged.get(name) ?? 0) + option.count);
  }

  return [...merged.entries()]
    .filter(([name]) => name.toLowerCase().includes(needle))
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_PER_GROUP)
    .map(([name, count]) => ({
      kind: "vendor" as const,
      id: name,
      title: name,
      subtitle: `${count.toLocaleString("en-US")} containers`,
      href: `/containers?trucker=${encodeURIComponent(name)}`,
    }));
}

async function searchInvoices(q: string): Promise<SearchHit[]> {
  if (!config.database.configured) return [];

  try {
    const { rows } = await query<{
      invoice_number: string;
      total_amount: string | null;
      responsible_party: string | null;
      lines: number;
    }>(
      `SELECT i.invoice_number,
              i.total_amount,
              i.responsible_party,
              COUNT(l.container_number)::int AS lines
         FROM invoices i
         LEFT JOIN invoice_lines l ON l.invoice_number = i.invoice_number
        WHERE i.invoice_number ILIKE $1
        GROUP BY i.invoice_number, i.total_amount, i.responsible_party
        ORDER BY i.invoice_number
        LIMIT ${MAX_PER_GROUP}`,
      [`%${q}%`],
    );

    return rows.map((row) => ({
      kind: "invoice" as const,
      id: row.invoice_number,
      title: row.invoice_number,
      subtitle: [
        row.responsible_party,
        `${row.lines} container${row.lines === 1 ? "" : "s"}`,
        row.total_amount ? `$${Number(row.total_amount).toLocaleString("en-US")}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      href: `/detention?invoice=${encodeURIComponent(row.invoice_number)}`,
    }));
  } catch {
    // Degrade this group only. See the note at the top.
    return [];
  }
}
