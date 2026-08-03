/**
 * Calendar dates out of Postgres.
 *
 * node-postgres materialises a `DATE` column as a JavaScript `Date` set to
 * LOCAL midnight. `2026-08-02` arrives as `2026-08-02T00:00:00+05:00`, so the
 * obvious-looking `.toISOString().slice(0, 10)` yields `2026-08-01` — every
 * date silently a day early for anyone east of UTC, and perfectly correct for
 * anyone on it. That is how the bug survives review and testing.
 *
 * A last free day is a calendar day, not an instant. Reading the components
 * back in the same timezone they were built in is the only conversion that
 * cannot shift the day.
 *
 * Use this for every `DATE` column. Timestamps (`TIMESTAMPTZ`) are genuine
 * instants and should keep using `.toISOString()`.
 */
export function pgDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return (
    `${value.getFullYear()}-` +
    `${String(value.getMonth() + 1).padStart(2, "0")}-` +
    `${String(value.getDate()).padStart(2, "0")}`
  );
}
