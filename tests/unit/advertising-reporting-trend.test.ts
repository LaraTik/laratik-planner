import { describe, expect, it } from "vitest";
import {
  aggregateAdvertisingTrend,
  type AdvertisingTrendPoint,
} from "@/lib/advertising/reporting-trend";

const points: readonly AdvertisingTrendPoint[] = [
  { date: "2026-10-04", spend: 2, impressions: 100, clicks: 10, results: 1 },
  { date: "2026-10-05", spend: 3, impressions: 150, clicks: 15, results: 2 },
  { date: "2026-10-12", spend: 5, impressions: 200, clicks: 20, results: null },
];

describe("aggregateAdvertisingTrend", () => {
  it("keeps daily points ordered and preserves null result gaps", () => {
    expect(aggregateAdvertisingTrend(points, "day")).toEqual(points);
  });

  it("buckets weeks from Sunday without applying a local timezone", () => {
    expect(aggregateAdvertisingTrend(points, "week")).toEqual([
      { date: "2026-10-04", spend: 5, impressions: 250, clicks: 25, results: 3 },
      { date: "2026-10-11", spend: 5, impressions: 200, clicks: 20, results: null },
    ]);
  });

  it("buckets months and never converts an unavailable result to zero", () => {
    expect(aggregateAdvertisingTrend(points, "month")).toEqual([
      { date: "2026-10-01", spend: 10, impressions: 450, clicks: 45, results: null },
    ]);
  });
});
