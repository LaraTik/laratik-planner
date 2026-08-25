/**
 * FEAT-15 (GAP-FULL-REVIEW-2026-08-25) — generic CSV serialiser.
 *
 * Why this exists: every list-export endpoint (planning CSV,
 * reviews CSV, brand-kit voice rules CSV, …) needs the same
 * quoting / escaping rules, and getting them wrong corrupts the
 * download silently. One tiny module is easier to audit than N
 * ad-hoc `JSON.stringify` shims.
 *
 * Format reference: RFC 4180.
 *   - Fields containing comma, double-quote, CR, or LF are
 *     wrapped in double quotes.
 *   - Inner double-quotes are doubled (`"` → `""`).
 *   - Line terminator is CRLF.
 *
 * The function is pure and side-effect free. The route handler
 * picks a filename + Content-Disposition and streams the result.
 */

export type CsvColumn<T> = {
  /** Column header (first row). */
  header: string;
  /**
   * Cell value extractor. Return a number, boolean, Date, or string.
   * `null` and `undefined` become an empty cell. Objects are
   * JSON-stringified (a planner-friendly fallback).
   */
  get: (row: T) => unknown;
};

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  const s = typeof value === "string" ? value : JSON.stringify(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function rowsToCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCell(c.header)).join(",");
  const lines = rows.map((row) => columns.map((c) => escapeCell(c.get(row))).join(","));
  return [header, ...lines].join("\r\n") + "\r\n";
}

/** Build a Content-Disposition header value for an inline download. */
export function csvDisposition(filename: string): string {
  return `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}"`;
}
