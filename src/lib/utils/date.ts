/**
 * Date helpers for the planning detail page.
 *
 * The `datetime-local` input format is `YYYY-MM-DDTHH:mm` in
 * the browser's local timezone. When the planning detail
 * page round-trips a date through an inline-edit field, we
 * need to:
 *  - Convert the server's `Date` (UTC) to the input format
 *    in the workspace's local timezone. The browser's
 *    `datetime-local` value is the local clock time.
 *  - Convert the user's `YYYY-MM-DDTHH:mm` back to a `Date`
 *    for the server.
 *
 * Why not use `toISOString().slice(0, 16)`? `toISOString`
 * always serialises in UTC, so a 9 AM local time would round
 * to a different `YYYY-MM-DDTHH:mm` depending on the
 * timezone offset. The user's calendar would say "9 AM" and
 * the value sent to the server would say "8 AM" or "10 AM".
 *
 * Instead, we format in the *local* clock:
 *  - `formatDateForInput` reads the date's local Y/M/D/h/m
 *  - `parseInputAsLocalDate` constructs a `Date` whose
 *    instant corresponds to the local-clock values
 *
 * Both helpers are total: an invalid input string returns
 * the `Date` round-tripped the other way (e.g. parsing
 * "2026-13-99T99:99" gives a `Date` for the server's epoch),
 * which is fine for a `type="datetime-local"` input that
 * already validated on the browser side.
 */

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

export function formatDateForInput(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function parseInputAsLocalDate(value: string): Date {
  // The input value is in the form `YYYY-MM-DDTHH:mm` (or
  // `YYYY-MM-DDTHH:mm:ss`). `new Date("YYYY-MM-DDTHH:mm")`
  // parses the value as *local* clock time, which is what
  // we want. `new Date("2026-08-29T09:00")` →
  // `Date(2026-08-29T07:00:00.000Z)` in CEST. The server
  // stores UTC, the user sees their local time.
  if (!value) return new Date(NaN);
  return new Date(value);
}
