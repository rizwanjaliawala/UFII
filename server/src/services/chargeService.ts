import { config } from "../config/index.js";
import { query } from "../db/pool.js";

/**
 * Charges attached to a container: D&D invoice lines, credit notes, FBU.
 *
 * Feeds the Container 360 "Invoices & Cost" section. This reports what was
 * actually billed — the estimated-versus-actual cost engine is Phase 4.
 */

export interface ContainerCharges {
  containerNumber: string;
  available: boolean;
  lines: {
    invoiceNumber: string;
    chargeType: string;
    amount: number;
    days: number | null;
    pickUpDate: string | null;
    returnDate: string | null;
    lastFreeDay: string | null;
    responsibleParty: string | null;
    trucker: string | null;
    paymentStatus: string | null;
    remarks: string | null;
  }[];
  creditNotes: {
    amount: number;
    company: string | null;
    reason: string | null;
    status: string | null;
    creditNoteNumber: string | null;
  }[];
  fbuCharges: {
    invoiceNumber: string | null;
    amount: number;
    trucker: string | null;
    chargeType: string | null;
  }[];
  totals: { charged: number; credited: number; net: number };
}

import { pgDate as day } from "../db/dates.js";

export async function getContainerCharges(
  containerNumber: string,
): Promise<ContainerCharges> {
  const empty: ContainerCharges = {
    containerNumber,
    available: false,
    lines: [],
    creditNotes: [],
    fbuCharges: [],
    totals: { charged: 0, credited: 0, net: 0 },
  };

  if (!config.database.configured) return empty;

  const [lines, credits, fbu] = await Promise.all([
    query<{
      invoice_number: string;
      charge_type: string;
      amount: string;
      days: number | null;
      pick_up_date: Date | null;
      return_date: Date | null;
      last_free_day: Date | null;
      responsible_party: string | null;
      trucker: string | null;
      source_payment_status: string | null;
      remarks: string | null;
    }>(
      `SELECT l.invoice_number, l.charge_type, l.amount, l.days,
              l.pick_up_date, l.return_date, l.last_free_day, l.remarks,
              i.responsible_party, i.trucker, i.source_payment_status
         FROM invoice_lines l
         LEFT JOIN invoices i ON i.invoice_number = l.invoice_number
        WHERE l.container_number = $1
        ORDER BY l.pick_up_date NULLS LAST, l.invoice_number`,
      [containerNumber],
    ),
    query<{
      amount: string;
      company: string | null;
      reason: string | null;
      status: string | null;
      credit_note_number: string | null;
    }>(
      `SELECT amount, company, reason, status, credit_note_number
         FROM credit_notes WHERE container_number = $1 ORDER BY id`,
      [containerNumber],
    ),
    query<{
      invoice_number: string | null;
      amount: string;
      trucker: string | null;
      charge_type: string | null;
    }>(
      `SELECT invoice_number, amount, trucker, charge_type
         FROM fbu_charges WHERE container_number = $1 ORDER BY id`,
      [containerNumber],
    ),
  ]);

  const mappedLines = lines.rows.map((row) => ({
    invoiceNumber: row.invoice_number,
    chargeType: row.charge_type,
    amount: Number(row.amount),
    days: row.days,
    pickUpDate: day(row.pick_up_date),
    returnDate: day(row.return_date),
    lastFreeDay: day(row.last_free_day),
    responsibleParty: row.responsible_party,
    trucker: row.trucker,
    paymentStatus: row.source_payment_status,
    remarks: row.remarks,
  }));

  const mappedCredits = credits.rows.map((row) => ({
    amount: Number(row.amount),
    company: row.company,
    reason: row.reason,
    status: row.status,
    creditNoteNumber: row.credit_note_number,
  }));

  const mappedFbu = fbu.rows.map((row) => ({
    invoiceNumber: row.invoice_number,
    amount: Number(row.amount),
    trucker: row.trucker,
    chargeType: row.charge_type,
  }));

  // FBU charges are billed separately from D&D but are still money owed on
  // this container, so they count toward the charged total.
  const charged =
    mappedLines.reduce((sum, l) => sum + l.amount, 0) +
    mappedFbu.reduce((sum, f) => sum + f.amount, 0);
  const credited = mappedCredits.reduce((sum, c) => sum + c.amount, 0);

  return {
    containerNumber,
    available: true,
    lines: mappedLines,
    creditNotes: mappedCredits,
    fbuCharges: mappedFbu,
    totals: { charged, credited, net: charged - credited },
  };
}
