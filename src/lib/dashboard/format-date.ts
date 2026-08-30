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

const MS_PER_DAY = 86_400_000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(a: Date, b: Date): number {
  const aStart = startOfDay(a).getTime();
  const bStart = startOfDay(b).getTime();
  return Math.round((aStart - bStart) / MS_PER_DAY);
}

const SHORT_MONTH = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatMonthDay(d: Date): string {
  return `${SHORT_MONTH[d.getMonth()]} ${d.getDate()}`;
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
): OperationalDate {
  void workspaceTimezone; // The TZ chip already shows the workspace TZ; the
  // row time is rendered in the user's local TZ. Acceptable for v1
  // because every Just Halal user is in one TZ; revisit when a
  // cross-TZ workspace needs it.
  const dayDelta = daysBetween(plannedPublishAt, now);
  const time = formatTime(plannedPublishAt);
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
    label = formatMonthDay(plannedPublishAt);
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
  const title = plannedPublishAt.toLocaleString();
  return { label, relative, overdueDays, title };
}
