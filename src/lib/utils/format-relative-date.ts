/**
 * Format a `Date | string` as a short, human-readable relative time
 * stamp in the active interface locale ("just now", "5 min. ago",
 * "2 hr. ago", "3 days ago", "Oct 12, 2024").
 *
 * Captured-relative-to-now is good enough for "Last updated" cells —
 * we don't need to ship a full date library for v1.
 */
import { type LocaleCode } from "@/lib/i18n/locales";
import { DateFormat, formatDate } from "@/lib/i18n/format-locale";

export function formatRelativeDate(
  date: Date | string,
  now: Date = new Date(),
  locale: LocaleCode = "en",
): string {
  const ms = date instanceof Date ? date.getTime() : Date.parse(String(date));
  if (!Number.isFinite(ms)) return "—";
  const diffMs = now.getTime() - ms;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  // Future dates — show an absolute date instead of "in 5m".
  if (diffMs < 0) {
    return formatDate(new Date(ms), locale, DateFormat.short);
  }
  const relative = new Intl.RelativeTimeFormat(locale, {
    numeric: "auto",
    style: "short",
  });
  if (diffMs < minute) return relative.format(0, "second");
  if (diffMs < hour) return relative.format(-Math.round(diffMs / minute), "minute");
  if (diffMs < day) return relative.format(-Math.round(diffMs / hour), "hour");
  if (diffMs < 7 * day) return relative.format(-Math.round(diffMs / day), "day");
  return formatDate(new Date(ms), locale, DateFormat.short);
}
