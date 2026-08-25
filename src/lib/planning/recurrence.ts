import { z } from "zod";

/**
 * FEAT-13 (GAP-FULL-REVIEW-2026-08-25) — recurrence rule + holiday
 * suppression schemas (master prompt §11 planning layer).
 *
 * The schema is intentionally narrow: a planner should be able to
 * express "every Monday for 8 weeks, skip Canadian holidays" without
 * dragging in a full RFC 5545 RRULE engine. The shape covers the
 * common agency use case (weekly cadence on a fixed weekday) plus
 * the few variations planners ask for (bi-weekly, monthly, N times).
 *
 * Every field is optional with a sensible default so the planner form
 * can present a "weekly on Monday" UX with two clicks and a count.
 *
 * Round-tripping with the existing `content_templates.relative_schedule_rule`
 * jsonb column is intentional — the planner library can author a
 * template, and individual content items (when the schema lands) can
 * reference the same shape. Today the function helpers in
 * `@/lib/planning/calendar` accept the rule as a `RecurrenceRule`
 * value via the `recurrenceRules` opt so the logic is testable
 * before the schema column ships.
 */

/** ISO weekday number: 1 = Monday, 7 = Sunday. */
export const weekdaySchema = z.number().int().min(1).max(7);
export type Weekday = z.infer<typeof weekdaySchema>;

export const recurrenceFrequencySchema = z.enum(["daily", "weekly", "biweekly", "monthly"]);
export type RecurrenceFrequency = z.infer<typeof recurrenceFrequencySchema>;

export const RecurrenceRuleSchema = z.object({
  /**
   * How often the content should be re-published. Defaults to
   * "weekly" so an empty form is still a sensible rule.
   */
  frequency: recurrenceFrequencySchema.default("weekly"),
  /**
   * Step multiplier — for "every 2 weeks" pass `frequency: "weekly"`
   * with `interval: 2`. Defaults to 1 (every period).
   */
  interval: z.number().int().min(1).max(52).default(1),
  /**
   * For weekly/biweekly recurrences: which weekday(s) to land on.
   * ISO 1..7. Optional — when omitted, the rule lands on the same
   * weekday as the base date.
   */
  byWeekday: z.array(weekdaySchema).min(1).max(7).optional(),
  /**
   * Stop after this many occurrences. Inclusive. Omit (with `until`)
   * for an open-ended rule.
   */
  count: z.number().int().min(1).max(520).optional(),
  /**
   * Or stop at this date (inclusive). Stored as an ISO date string
   * (`YYYY-MM-DD`) so the rule is timezone-stable.
   */
  until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "until must be a YYYY-MM-DD date")
    .optional(),
});
export type RecurrenceRule = z.infer<typeof RecurrenceRuleSchema>;

/**
 * Per-workspace holiday suppression. Two equivalent shapes:
 *
 *   1. A country code (e.g. "CA", "US") — the route layer
 *      resolves the actual holiday list from a static table.
 *   2. An explicit list of dates the workspace considers holidays.
 *
 * Either is sufficient. Both can co-exist; the explicit dates are
 * always applied, and a country code is applied on top if present.
 */
export const HolidayCalendarSchema = z.object({
  /** ISO-3166-1 alpha-2 country code (uppercase). */
  country: z
    .string()
    .regex(/^[A-Z]{2}$/, "country must be a 2-letter ISO code")
    .optional(),
  /** Explicit holiday dates in `YYYY-MM-DD` form. */
  explicitDates: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .max(200)
    .optional(),
});
export type HolidayCalendar = z.infer<typeof HolidayCalendarSchema>;

/** Static holiday table for the v1 country set. */
export const COUNTRY_HOLIDAYS: Record<string, string[]> = {
  // Canadian federal statutory holidays. Add more years as needed;
  // the loader falls back to "no holidays" for years not in the map.
  CA: [
    "2026-01-01", // New Year's Day
    "2026-02-16", // Family Day
    "2026-04-03", // Good Friday
    "2026-05-18", // Victoria Day
    "2026-07-01", // Canada Day
    "2026-08-03", // Civic Holiday
    "2026-09-07", // Labour Day
    "2026-10-12", // Thanksgiving
    "2026-11-11", // Remembrance Day
    "2026-12-25", // Christmas
    "2026-12-26", // Boxing Day
    "2027-01-01",
    "2027-02-15",
    "2027-03-26",
    "2027-05-24",
    "2027-07-01",
    "2027-08-02",
    "2027-09-06",
    "2027-10-11",
    "2027-11-11",
    "2027-12-25",
    "2027-12-26",
  ],
  US: [
    "2026-01-01", // New Year's Day
    "2026-01-19", // MLK Day
    "2026-02-16", // Presidents' Day
    "2026-05-25", // Memorial Day
    "2026-06-19", // Juneteenth
    "2026-07-04", // Independence Day
    "2026-09-07", // Labour Day
    "2026-10-12", // Columbus Day
    "2026-11-11", // Veterans Day
    "2026-11-26", // Thanksgiving
    "2026-12-25", // Christmas
  ],
};

/**
 * Flatten a holiday calendar into a Set of `YYYY-MM-DD` strings
 * covering both the explicit list and the country table (if any).
 * `rangeStart` / `rangeEnd` are accepted so future large calendars
 * can be filtered; today the table is small enough to ignore the
 * range, but the signature is future-proof.
 */
export function resolveHolidaySet(
  calendar: HolidayCalendar | null | undefined,
  rangeStart?: Date,
  rangeEnd?: Date,
): Set<string> {
  const set = new Set<string>();
  if (!calendar) return set;
  for (const date of calendar.explicitDates ?? []) {
    if (dateWithin(date, rangeStart, rangeEnd)) set.add(date);
  }
  if (calendar.country) {
    for (const date of COUNTRY_HOLIDAYS[calendar.country] ?? []) {
      if (dateWithin(date, rangeStart, rangeEnd)) set.add(date);
    }
  }
  return set;
}

function dateWithin(isoDate: string, start?: Date, end?: Date): boolean {
  if (!start && !end) return true;
  const ts = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(ts)) return true;
  if (start && ts < start.getTime()) return false;
  if (end && ts >= end.getTime()) return false;
  return true;
}

/**
 * Expand a single base date through a recurrence rule into the
 * ordered set of occurrences inside the `[rangeStart, rangeEnd)`
 * window. The base date itself is always included (when in range)
 * even if it lands on a holiday — holiday filtering is a separate
 * step the caller composes.
 *
 * The function is pure: it does not mutate `rule` and produces a
 * deterministic output for the same inputs. This keeps the unit
 * test cheap and the calendar route snappy.
 */
export function expandRecurrence(
  rule: RecurrenceRule,
  baseDate: Date,
  rangeStart: Date,
  rangeEnd: Date,
): Date[] {
  if (!(rangeStart instanceof Date) || !(rangeEnd instanceof Date)) {
    throw new Error("expandRecurrence: range bounds must be Dates");
  }
  if (rangeEnd <= rangeStart) return [];

  const out: Date[] = [];
  const interval = rule.interval;
  const stepDays =
    rule.frequency === "daily"
      ? 1
      : rule.frequency === "weekly"
        ? 7
        : rule.frequency === "biweekly"
          ? 14
          : /* monthly */ 30; // approximate; monthly rules hit the weekday path below

  // Walk up to `count` occurrences (or until `until` / range end).
  // We cap the loop at the count + 5_000 sentinel so a misconfigured
  // rule can't spin forever. The realistic max is `count` (≤ 520).
  const hardCap = (rule.count ?? 520) + 5_000;
  for (let i = 0; i < hardCap; i += 1) {
    if (rule.count !== undefined && out.length >= rule.count) break;
    let occurrence: Date;
    if (i === 0) {
      occurrence = new Date(baseDate.getTime());
    } else if (rule.frequency === "monthly") {
      occurrence = addMonths(baseDate, i * interval);
    } else {
      occurrence = new Date(baseDate.getTime() + i * interval * stepDays * 86_400_000);
    }
    if (rule.until) {
      const untilTs = Date.parse(`${rule.until}T23:59:59.999Z`);
      if (occurrence.getTime() > untilTs) break;
    }
    if (occurrence >= rangeEnd) break;
    if (occurrence >= rangeStart) {
      out.push(occurrence);
    }
  }
  return out;
}

function addMonths(base: Date, months: number): Date {
  const d = new Date(base.getTime());
  const targetMonth = d.getMonth() + months;
  d.setMonth(targetMonth);
  // setMonth auto-rolls (e.g. Jan 31 + 1 month = Mar 3). We accept
  // the natural roll behaviour — for monthly recurrences the
  // planner picks a base date with a stable day-of-month anyway.
  return d;
}

/** True when the given date's `YYYY-MM-DD` form is in the holiday set. */
export function isHolidayDate(date: Date, holidays: Set<string>): boolean {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return holidays.has(`${yyyy}-${mm}-${dd}`);
}
