export const MIN_TREND_SOURCES = 4;

export function trendLifecycleMessageKey(lifecycle: string): string {
  const normalized = lifecycle.toLowerCase().replace(/[^a-z]/g, "");
  return `trends.card.lifecycle${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

export function formatTrendFreshness(value: string, locale: string, now = Date.now()): string {
  const ageHours = Math.max(0, Math.round((now - new Date(value).getTime()) / 3_600_000));
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (ageHours < 1) return formatter.format(0, "hour");
  if (ageHours < 24) return formatter.format(-ageHours, "hour");
  return formatter.format(-Math.round(ageHours / 24), "day");
}
