import { config } from "../config/index.js";
import { query } from "../db/pool.js";
import { pgDate } from "../db/dates.js";

/**
 * Detention & Demurrage (doc 03 §D&D, doc 05 §Invoice Log).
 *
 * Reads the three Source Sheet 2 tabs already in Neon: D&D invoices, credit
 * notes and FBU charges. This is the invoice *log* — parsing PDFs and the
 * container-match review workflow arrive with the document pipeline, so
 * nothing here creates or approves a charge.
 *
 * One invoice spans many containers (`NAIC1340615` covers five), which is why
 * the log lists invoice headers with a line count rather than pretending the
 * relationship is one-to-one.
 */

export interface InvoiceRow {
  invoiceNumber: string;
  totalAmount: number;
  containers: number;
  chargeTypes: string[];
  responsibleParty: string | null;
  trucker: string | null;
  paymentStatus: string | null;
  earliestPickUp: string | null;
  latestReturn: string | null;
}

export interface CreditNoteRow {
  creditNoteNumber: string | null;
  containerNumber: string | null;
  amount: number;
  company: string | null;
  reason: string | null;
  status: string | null;
}

export interface FbuRow {
  invoiceNumber: string | null;
  containerNumber: string | null;
  amount: number;
  trucker: string | null;
  chargeType: string | null;
}

export interface DetentionSummary {
  generatedAt: string;
  available: boolean;
  totals: {
    invoices: number;
    invoiceLines: number;
    charged: number;
    credited: number;
    net: number;
    fbu: number;
    unmatchedCreditNotes: number;
  };
  byChargeType: { type: string; count: number; amount: number }[];
  byResponsibleParty: { name: string; invoices: number; amount: number }[];
  invoices: InvoiceRow[];
  creditNotes: CreditNoteRow[];
  fbuCharges: FbuRow[];
}

export interface DetentionQuery {
  q?: string;
  responsibleParty?: string;
  chargeType?: string;
  limit?: number;
}

const DEFAULT_LIMIT = 200;

export async function getDetentionLog(
  params: DetentionQuery = {},
  now = new Date(),
): Promise<DetentionSummary> {
  const empty: DetentionSummary = {
    generatedAt: now.toISOString(),
    available: false,
    totals: {
      invoices: 0,
      invoiceLines: 0,
      charged: 0,
      credited: 0,
      net: 0,
      fbu: 0,
      unmatchedCreditNotes: 0,
    },
    byChargeType: [],
    byResponsibleParty: [],
    invoices: [],
    creditNotes: [],
    fbuCharges: [],
  };

  if (!config.database.configured) return empty;

  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, 1000);

  // Filters are applied to the invoice list only. The totals and breakdowns
  // deliberately describe the whole ledger — a filtered view that also moved
  // the headline figures would make it impossible to see a subset in context.
  const values: unknown[] = [];
  const where: string[] = [];
  const bind = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (params.q) {
    const needle = `%${params.q.replace(/\s+/g, "")}%`;
    where.push(
      `(i.invoice_number ILIKE ${bind(needle)} OR EXISTS (
          SELECT 1 FROM invoice_lines x
           WHERE x.invoice_number = i.invoice_number
             AND x.container_number ILIKE ${bind(needle)}))`,
    );
  }
  if (params.responsibleParty) {
    where.push(`i.responsible_party = ${bind(params.responsibleParty)}`);
  }
  if (params.chargeType) {
    where.push(
      `EXISTS (SELECT 1 FROM invoice_lines c
                WHERE c.invoice_number = i.invoice_number
                  AND c.charge_type = ${bind(params.chargeType)})`,
    );
  }

  const [totals, chargeTypes, parties, invoices, credits, fbu] = await Promise.all([
    query<Record<string, string>>(
      `SELECT
         (SELECT COUNT(*) FROM invoices)::text                        AS invoices,
         (SELECT COUNT(*) FROM invoice_lines)::text                   AS invoice_lines,
         (SELECT COALESCE(SUM(amount), 0) FROM invoice_lines)::text   AS charged,
         (SELECT COALESCE(SUM(amount), 0) FROM credit_notes)::text    AS credited,
         (SELECT COALESCE(SUM(amount), 0) FROM fbu_charges)::text     AS fbu,
         (SELECT COUNT(*) FROM credit_notes
           WHERE container_number IS NULL
              OR container_number NOT IN (SELECT container_number FROM containers)
         )::text                                                      AS unmatched_credits`,
    ),
    query<{ type: string; count: number; amount: string }>(
      `SELECT charge_type AS type, COUNT(*)::int AS count,
              COALESCE(SUM(amount), 0)::text AS amount
         FROM invoice_lines GROUP BY charge_type ORDER BY SUM(amount) DESC NULLS LAST`,
    ),
    query<{ name: string; invoices: number; amount: string }>(
      `SELECT COALESCE(i.responsible_party, 'Unattributed') AS name,
              COUNT(DISTINCT i.invoice_number)::int          AS invoices,
              COALESCE(SUM(l.amount), 0)::text               AS amount
         FROM invoices i
         LEFT JOIN invoice_lines l ON l.invoice_number = i.invoice_number
        GROUP BY 1 ORDER BY SUM(l.amount) DESC NULLS LAST`,
    ),
    query<{
      invoice_number: string;
      total_amount: string | null;
      containers: number;
      charge_types: string[];
      responsible_party: string | null;
      trucker: string | null;
      source_payment_status: string | null;
      earliest_pick_up: Date | null;
      latest_return: Date | null;
    }>(
      `SELECT i.invoice_number,
              COALESCE(SUM(l.amount), 0)::text        AS total_amount,
              COUNT(l.container_number)::int          AS containers,
              ARRAY_AGG(DISTINCT l.charge_type)
                FILTER (WHERE l.charge_type IS NOT NULL) AS charge_types,
              i.responsible_party, i.trucker, i.source_payment_status,
              MIN(l.pick_up_date)                     AS earliest_pick_up,
              MAX(l.return_date)                      AS latest_return
         FROM invoices i
         LEFT JOIN invoice_lines l ON l.invoice_number = i.invoice_number
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        GROUP BY i.invoice_number, i.responsible_party, i.trucker,
                 i.source_payment_status
        ORDER BY SUM(l.amount) DESC NULLS LAST
        LIMIT ${limit}`,
      values,
    ),
    query<{
      credit_note_number: string | null;
      container_number: string | null;
      amount: string;
      company: string | null;
      reason: string | null;
      status: string | null;
    }>(
      `SELECT credit_note_number, container_number, amount, company, reason, status
         FROM credit_notes ORDER BY amount DESC NULLS LAST LIMIT ${limit}`,
    ),
    query<{
      invoice_number: string | null;
      container_number: string | null;
      amount: string;
      trucker: string | null;
      charge_type: string | null;
    }>(
      `SELECT invoice_number, container_number, amount, trucker, charge_type
         FROM fbu_charges ORDER BY amount DESC NULLS LAST LIMIT ${limit}`,
    ),
  ]);

  const t = totals.rows[0] ?? {};
  const charged = Number(t.charged ?? 0);
  const credited = Number(t.credited ?? 0);

  return {
    generatedAt: now.toISOString(),
    available: true,
    totals: {
      invoices: Number(t.invoices ?? 0),
      invoiceLines: Number(t.invoice_lines ?? 0),
      charged,
      credited,
      net: charged - credited,
      fbu: Number(t.fbu ?? 0),
      unmatchedCreditNotes: Number(t.unmatched_credits ?? 0),
    },
    byChargeType: chargeTypes.rows.map((row) => ({
      type: row.type ?? "Unspecified",
      count: row.count,
      amount: Number(row.amount),
    })),
    byResponsibleParty: parties.rows.map((row) => ({
      name: row.name,
      invoices: row.invoices,
      amount: Number(row.amount),
    })),
    invoices: invoices.rows.map((row) => ({
      invoiceNumber: row.invoice_number,
      totalAmount: Number(row.total_amount ?? 0),
      containers: row.containers,
      chargeTypes: row.charge_types ?? [],
      responsibleParty: row.responsible_party,
      trucker: row.trucker,
      paymentStatus: row.source_payment_status,
      earliestPickUp: pgDate(row.earliest_pick_up),
      latestReturn: pgDate(row.latest_return),
    })),
    creditNotes: credits.rows.map((row) => ({
      creditNoteNumber: row.credit_note_number,
      containerNumber: row.container_number,
      amount: Number(row.amount),
      company: row.company,
      reason: row.reason,
      status: row.status,
    })),
    fbuCharges: fbu.rows.map((row) => ({
      invoiceNumber: row.invoice_number,
      containerNumber: row.container_number,
      amount: Number(row.amount),
      trucker: row.trucker,
      chargeType: row.charge_type,
    })),
  };
}
