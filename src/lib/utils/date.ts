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
 * Instead, we format in the *workspace* clock (not the
 * browser's local clock):
 *  - `formatDateInTimeZoneForInput` reads the date's Y/M/D/
 *    h/m in the supplied IANA timezone. The user sees "9 AM"
 *    if the workspace timezone is Berlin and the value
 *    represents 9 AM Berlin time, no matter which city the
 *    planner is currently in.
 *  - `parseInputAsWorkspaceDate` constructs a `Date` whose
 *    instant corresponds to the workspace-local wall-clock
 *    values (`fromZonedTime`).
 *
 * The previous helpers (`formatDateForInput` /
 * `parseInputAsLocalDate`) used the browser's local clock —
 * which caused a multi-hour timezone mismatch for any user
 * not in the workspace's timezone (audit issue, see commit
 * history). They are still exported for back-compat with
 * existing call-sites that already account for the local
 * clock semantics, with a deprecation note in the docstring.
 */

import { fromZonedTime, formatInTimeZone } from "date-fns-tz";

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * Format a `Date` (UTC instant) for an `<input type="datetime-local">`
 * using the **workspace** IANA timezone, not the browser's local clock.
 *
 * @param value   The instant — either a `Date` or an ISO 8601 string.
 * @param timeZone IANA timezone, e.g. `"Europe/Berlin"`.
 *
 * This is the canonical helper for all planning detail /
 * quick-create / edit-form date inputs. The user's local
 * timezone is *not* consulted: a New York planner working on
 * a Berlin-timezone workspace still sees "09:00" when the
 * stored instant represents 9 AM Berlin time.
 */
export function formatDateInTimeZoneForInput(value: string | Date, timeZone: string): string {
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) return "";
  // `formatInTimeZone("yyyy-MM-dd'T'HH:mm", date, timeZone)`
  // emits the calendar parts in the supplied TZ.
  const formatted = formatInTimeZone(instant, timeZone, "yyyy-MM-dd'T'HH:mm");
  // Some ICU builds render the literal characters — only
  // strip them if they survived, otherwise treat the typed
  // shape as the source of truth (defensive against future
  // `date-fns` swaps of the format-token parser).
  if (formatted.includes("'")) {
    return formatted.replace(/'/g, "");
  }
  return formatted;
}

/**
 * Parse a `YYYY-MM-DDTHH:mm` string the user typed in a
 * `<input type="datetime-local">` as a wall-clock time in the
 * **workspace** timezone. Returns an invalid Date (NaN) when
 * the input is empty or unparseable.
 *
 * Pair with `formatDateInTimeZoneForInput` so a planner
 * editing a Berlin-timezone item from a New York browser
 * keeps their "9 AM" reading as 9 AM Berlin time on save.
 *
 * @param value     The typed `YYYY-MM-DDTHH:mm` string.
 * @param timeZone  IANA timezone, e.g. `"Europe/Berlin"`.
 */
export function parseInputAsWorkspaceDate(value: string, timeZone: string): Date {
  if (!value) return new Date(NaN);
  // Accept both `YYYY-MM-DDTHH:mm` and `YYYY-MM-DDTHH:mm:ss`.
  // `fromZonedTime(wallClock, timeZone)` returns the UTC
  // instant that corresponds to the supplied wall-clock in
  // the supplied timezone (it does NOT interpret the wall
  // clock as the browser's local TZ).
  // The literal pattern here uses `T` as a separator and
  // appends `:00` if the seconds are missing.
  const normalised = /:\d{2}:\d{2}/.test(value) ? value : `${value}:00`;
  try {
    return fromZonedTime(normalised, timeZone);
  } catch {
    return new Date(NaN);
  }
}

// ── Deprecated: kept for one release for any remaining
//    callers that depend on browser-local semantics. New
//    callers should use the timezone-aware helpers above.
export function formatDateForInput(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function parseInputAsLocalDate(value: string): Date {
  if (!value) return new Date(NaN);
  return new Date(value);
}
