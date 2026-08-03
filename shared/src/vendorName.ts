/**
 * Vendor name canonicalisation.
 *
 * The source sheets spell the same company several ways, which would split one
 * vendor into several on every KPI:
 *
 *   "S&P" (44)                vs "S and P Freight, Inc" (160)
 *   "Priority1, Inc." (S1)    vs "Priority1, Inc" (S2)
 *   "ALPI" (S1)               vs "ALPI USA" (S2)
 *   "Utopia"                  vs "Utopia Trucking"
 *
 * Two layers, in order:
 *   1. An explicit alias map for cases no algorithm can infer — nothing
 *      mechanical turns "S&P" into "S and P Freight".
 *   2. A structural fallback that strips legal suffixes and punctuation.
 *
 * Display names are preserved; only the *key* is canonicalised, so the UI
 * still shows what the operator typed.
 */

/** Explicit aliases → canonical display name. Keys are compared loosely. */
const ALIASES: Record<string, string> = {
  "s&p": "S&P Freight",
  "s and p": "S&P Freight",
  "s and p freight": "S&P Freight",
  "s&p freight": "S&P Freight",

  priority1: "Priority1",
  "priority 1": "Priority1",

  alpi: "ALPI",
  "alpi usa": "ALPI",

  marlin: "Marlin Shipping",
  "marlin shipping": "Marlin Shipping",

  echo: "Echo Global",
  "echo global": "Echo Global",
  "echo-global": "Echo Global",

  utopia: "Utopia",
  "utopia trucking": "Utopia",
  "utopia brands": "Utopia",

  "c-group": "C-Group",
  "c group": "C-Group",

  "mlm transport": "MLM Transport",
  "cbs trucking": "CBS Trucking",
  "barakat transport": "Barakat Transport",
  wwex: "WWEX",
};

/** Legal suffixes that carry no identity. */
const SUFFIXES = /\b(inc|incorporated|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|usa)\b/g;

/**
 * Reduce a name to a comparison key: lowercase, no punctuation, no legal
 * suffix, collapsed whitespace. "Priority1, Inc." and "Priority1, Inc" both
 * become "priority1".
 */
export function vendorKey(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const stripped = raw
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(SUFFIXES, " ")
    .replace(/[^a-z0-9&\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!stripped) return null;

  // Alias hit on the stripped form, or on the form with "&" spelled out.
  const spelled = stripped.replace(/&/g, " and ").replace(/\s+/g, " ").trim();
  const alias = ALIASES[stripped] ?? ALIASES[spelled];
  if (alias) return vendorKeyOf(alias);

  return stripped;
}

/** Key of an already-canonical name, without recursing through aliases. */
function vendorKeyOf(canonical: string): string {
  return canonical
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(SUFFIXES, " ")
    .replace(/[^a-z0-9&\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Display name for a vendor. Returns the mapped canonical form where one
 * exists, otherwise the operator's own text with whitespace tidied — inventing
 * a "proper" spelling for an unknown vendor would be worse than echoing it.
 */
export function canonicalVendorName(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const tidy = raw.replace(/\s+/g, " ").trim();
  if (!tidy) return null;

  const stripped = tidy
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(SUFFIXES, " ")
    .replace(/[^a-z0-9&\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const spelled = stripped.replace(/&/g, " and ").replace(/\s+/g, " ").trim();
  return ALIASES[stripped] ?? ALIASES[spelled] ?? tidy;
}

/** True when two spellings refer to the same vendor. */
export function isSameVendor(a: string | null, b: string | null): boolean {
  const keyA = vendorKey(a);
  const keyB = vendorKey(b);
  return keyA !== null && keyA === keyB;
}
