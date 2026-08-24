/**
 * M4 — social growth analytics.
 *
 * The application does NOT reconstruct follower totals from accumulated
 * deltas. Instead it queries the latest observed total within the
 * requested window and computes `latest − earliest`. The result is a
 * `Growth` triple: the absolute change, the percent change, and a
 * `partial` flag indicating whether some days in the window are
 * missing or whether any of the underlying metrics are unavailable
 * (`null`).
 *
 * A zero baseline yields `percent: null` because dividing by zero is
 * not a meaningful growth signal. A null baseline on either side
 * yields `null` on both sides because we cannot compute a delta.
 *
 * Missing days in the window are tolerated: the calculation works on
 * the first and last observed totals inside the window, not on the
 * day-by-day series. This is robust to provider gaps and to the
 * 7-day / 30-day / 90-day window boundaries.
 */

export type MetricSeriesPoint = {
  metricDate: string; // YYYY-MM-DD
  followerCount: number | null;
  reach: number | null;
  views: number | null;
  engagedAccounts: number | null;
  interactions: number | null;
  partial?: boolean;
};

export type Growth = {
  absolute: number | null;
  percent: number | null;
  partial: boolean;
};

export const SOCIAL_WINDOWS = [7, 30, 90] as const;
export type SocialWindow = (typeof SOCIAL_WINDOWS)[number];

function isSocialWindow(n: number): n is SocialWindow {
  return (SOCIAL_WINDOWS as readonly number[]).includes(n);
}

export function parseSocialWindow(value: string | number | null | undefined): SocialWindow {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return isSocialWindow(n) ? n : 7;
}

export function calculateGrowth(
  series: MetricSeriesPoint[],
  field: keyof MetricSeriesPoint = "followerCount",
): Growth {
  const values = series.map((p) => p[field]).filter((v): v is number => typeof v === "number");

  if (values.length < 2) {
    return { absolute: null, percent: null, partial: series.some((p) => p.partial === true) };
  }

  const earliest = values[0]!;
  const latest = values[values.length - 1]!;
  const absolute = latest - earliest;
  const percent = earliest === 0 ? null : (absolute / earliest) * 100;
  return { absolute, percent, partial: series.some((p) => p.partial === true) };
}

export function seriesInWindow(
  series: MetricSeriesPoint[],
  windowDays: number,
): MetricSeriesPoint[] {
  if (series.length === 0) return [];
  if (windowDays <= 0) return series;
  return series.slice(-windowDays);
}

export function chartSeries(
  series: MetricSeriesPoint[],
  field: keyof MetricSeriesPoint,
): Array<{ date: string; value: number | null }> {
  return series.map((p) => ({ date: p.metricDate, value: (p[field] as number | null) ?? null }));
}

export type ProfileSummary = {
  currentFollowers: number | null;
  growth7: Growth;
  growth30: Growth;
  growth90: Growth;
  lastSyncedAt: Date | null;
  connectionStatus: "manual" | "connected" | "needs_reauth" | "sync_error" | "disconnected";
};

export function buildProfileSummary(args: {
  fullSeries: MetricSeriesPoint[];
  lastSyncedAt: Date | null;
  connectionStatus: ProfileSummary["connectionStatus"];
}): ProfileSummary {
  const { fullSeries, lastSyncedAt, connectionStatus } = args;
  const last = fullSeries[fullSeries.length - 1];
  return {
    currentFollowers: last?.followerCount ?? null,
    growth7: calculateGrowth(seriesInWindow(fullSeries, 7)),
    growth30: calculateGrowth(seriesInWindow(fullSeries, 30)),
    growth90: calculateGrowth(seriesInWindow(fullSeries, 90)),
    lastSyncedAt,
    connectionStatus,
  };
}
