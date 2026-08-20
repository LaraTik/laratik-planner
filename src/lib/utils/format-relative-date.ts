/**
 * Format a `Date | string` as a short, human-readable relative time
 * stamp ("just now", "5m ago", "2h ago", "3d ago", "Oct 12, 2024").
 *
 * Captured-relative-to-now is good enough for "Last updated" cells —
 * we don't need to ship a full date library for v1.
 */
export function formatRelativeDate(date: Date | string, now: Date = new Date()): string {
  const ms = date instanceof Date ? date.getTime() : Date.parse(String(date));
  if (!Number.isFinite(ms)) return "—";
  const diffMs = now.getTime() - ms;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  // Future dates — show an absolute date instead of "in 5m".
  if (diffMs < 0) {
    return new Date(ms).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
  if (diffMs < minute) return "just now";
  if (diffMs < hour) return `${Math.round(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.round(diffMs / hour)}h ago`;
  if (diffMs < 7 * day) return `${Math.round(diffMs / day)}d ago`;
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
