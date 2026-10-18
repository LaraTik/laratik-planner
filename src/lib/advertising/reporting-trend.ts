export type TrendGranularity = "day" | "week" | "month";
export type TrendMetricKey = "spend" | "impressions" | "clicks" | "results";

export type AdvertisingTrendPoint = {
  readonly date: string;
  readonly spend: number;
  readonly impressions: number;
  readonly clicks: number;
  readonly results: number | null;
};

/**
 * Re-buckets already-authorized account observations for the reporting chart.
 * Dates are provider/account dates, so bucketing stays date-only and never
 * applies the browser timezone to a metric period.
 */
export function aggregateAdvertisingTrend(
  points: readonly AdvertisingTrendPoint[],
  granularity: TrendGranularity,
): AdvertisingTrendPoint[] {
  const buckets = new Map<string, AdvertisingTrendPoint[]>();

  for (const point of points) {
    const key = trendBucket(point.date, granularity);
    buckets.set(key, [...(buckets.get(key) ?? []), point]);
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, bucket]) => ({
      date,
      spend: bucket.reduce((sum, point) => sum + point.spend, 0),
      impressions: bucket.reduce((sum, point) => sum + point.impressions, 0),
      clicks: bucket.reduce((sum, point) => sum + point.clicks, 0),
      results: bucket.some((point) => point.results === null)
        ? null
        : bucket.reduce((sum, point) => sum + (point.results ?? 0), 0),
    }));
}

function trendBucket(date: string, granularity: TrendGranularity): string {
  if (granularity === "day") return date;

  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;

  if (granularity === "month") return date.slice(0, 7) + "-01";

  const day = parsed.getUTCDay();
  parsed.setUTCDate(parsed.getUTCDate() - day);
  return parsed.toISOString().slice(0, 10);
}
