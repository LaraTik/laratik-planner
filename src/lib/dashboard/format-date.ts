/**
 * Operational date formatting for the planning list.
 *
 * The list needs more than "Aug 15". It needs to surface:
 *   - today / tomorrow (so the user knows what's about to ship)
 *   - 3 days overdue (so the user knows what's slipping)
 *   - the time component when the date is within a week
 *
 * This is intentionally a small module — the existing date helpers
 * in the codebase render full timestamps. The list wants operational
 * signals, not timestamps.
 */

import type { LocaleCode } from "@/lib/i18n/locales";

const MS_PER_DAY = 86_400_000;

function zonedDateKey(d: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day));
}

function formatTime(d: Date, locale: LocaleCode, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    numberingSystem: "latn",
  }).format(d);
}

function formatMonthDay(d: Date, locale: LocaleCode, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: "numeric",
    month: "short",
    numberingSystem: "latn",
  }).format(d);
}

export interface OperationalDate {
  /** Short label, e.g. "Today · 18:00" or "3 days overdue" or "Aug 17". */
  label: string;
  /** "today" | "tomorrow" | "yesterday" | "future" | "past" — semantic, not text. */
  relative: "today" | "tomorrow" | "yesterday" | "future" | "past";
  /** Past-due day count. Positive when past-due, 0 otherwise. */
  overdueDays: number;
  /**
   * Title attribute — the full ISO timestamp for accessibility /
   * tooltip on hover.
   */
  title: string;
  /** Localized building blocks for callers that provide interface copy. */
  timeLabel: string;
  monthDayLabel: string;
  daysFromToday: number;
}

/**
 * Format a planning-list date into an operational label.
 *
 *   Today · 18:00
 *   Tomorrow · 12:00
 *   Yesterday · 09:30
 *   Aug 17
 *   3 days overdue
 *
 * The label intentionally hides the year (the month nav already
 * scopes the list) and shows the time only when the date is within
 * ±3 days of today. Past dates get an "X days overdue" suffix so
 * the user can scan for slippage.
 */
export function formatOperationalDate(
  plannedPublishAt: Date,
  now: Date,
  workspaceTimezone: string,
  locale: LocaleCode = "en",
): OperationalDate {
  const dayDelta = Math.round(
    (zonedDateKey(plannedPublishAt, workspaceTimezone) - zonedDateKey(now, workspaceTimezone)) /
      MS_PER_DAY,
  );
  const time = formatTime(plannedPublishAt, locale, workspaceTimezone);
  const monthDay = formatMonthDay(plannedPublishAt, locale, workspaceTimezone);
  let label: string;
  let relative: OperationalDate["relative"];
  let overdueDays = 0;
  if (dayDelta === 0) {
    label = `Today · ${time}`;
    relative = "today";
  } else if (dayDelta === 1) {
    label = `Tomorrow · ${time}`;
    relative = "tomorrow";
  } else if (dayDelta > 1 && dayDelta <= 3) {
    label = `In ${dayDelta} days · ${time}`;
    relative = "future";
  } else if (dayDelta > 3) {
    label = formatMonthDay(plannedPublishAt, "en", workspaceTimezone);
    relative = "future";
  } else {
    // Past-due, regardless of how many days back. The user wants
    // an operational signal ("slipped by N days"), not a relative
    // timestamp ("N days ago"). The "X days overdue" wording is
    // consistent with the readiness indicator on the same row.
    overdueDays = Math.abs(dayDelta);
    label = `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`;
    relative = overdueDays === 1 ? "yesterday" : "past";
  }
  const title = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: workspaceTimezone,
    numberingSystem: "latn",
  }).format(plannedPublishAt);
  return {
    label,
    relative,
    overdueDays,
    title,
    timeLabel: time,
    monthDayLabel: monthDay,
    daysFromToday: dayDelta,
  };
}
