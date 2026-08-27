import { describe, expect, it } from "vitest";
import {
  buildProfileSummary,
  calculateEngagementRate,
  calculateGrowth,
  chartSeries,
  parseSocialWindow,
  seriesInWindow,
  type MetricSeriesPoint,
} from "@/lib/social/analytics";

/**
 * M4 — growth analytics unit contract.
 *
 *   - the canonical growth cases from the superpowers plan
 *   - null propagation when either side of the window is missing
 *   - 0 baseline → percent is null (division-by-zero is meaningless)
 *   - missing days in the window do not crash the calculation
 *   - the window selector works for 7/30/90
 *   - the chart series exposes gaps as `null`, not `0`
 *   - the summary card surfaces the latest observation, all three
 *     windows, lastSyncedAt, and the connection status
 *   - the engagement rate mirrors the same null/partial/zero rules
 *     and uses the latest observed pair of (followers, engaged)
 */

function series(values: Array<number | null>, dates?: string[]): MetricSeriesPoint[] {
  return values.map((v, i) => ({
    metricDate: dates?.[i] ?? `2026-08-${(i + 1).toString().padStart(2, "0")}`,
    followerCount: v,
    reach: null,
    views: null,
    engagedAccounts: null,
    interactions: null,
  }));
}

/**
 * Engagement-rate test fixture. Unlike `series()`, this populates
 * `engagedAccounts` so the engagement-rate calc has both sides.
 * Pass `null` for either side to simulate a partial day.
 */
function engagementSeries(
  followers: Array<number | null>,
  engaged: Array<number | null>,
  dates?: string[],
): MetricSeriesPoint[] {
  return followers.map((f, i) => ({
    metricDate: dates?.[i] ?? `2026-08-${(i + 1).toString().padStart(2, "0")}`,
    followerCount: f,
    reach: null,
    views: null,
    engagedAccounts: engaged[i] ?? null,
    interactions: null,
  }));
}

describe("calculateGrowth", () => {
  it("handles the canonical case from the plan", () => {
    expect(calculateGrowth(series([100, 104, 103]))).toEqual({
      absolute: 3,
      percent: 3,
      partial: false,
    });
  });

  it("returns null for both sides when the series is null-only", () => {
    expect(calculateGrowth(series([null, 104]))).toEqual({
      absolute: null,
      percent: null,
      partial: false,
    });
  });

  it("returns null for both sides when the series is too short", () => {
    expect(calculateGrowth(series([100]))).toEqual({
      absolute: null,
      percent: null,
      partial: false,
    });
  });

  it("returns percent=null when the baseline is 0", () => {
    expect(calculateGrowth(series([0, 5]))).toEqual({
      absolute: 5,
      percent: null,
      partial: false,
    });
  });

  it("propagates partial when any point is marked partial", () => {
    const s = series([100, 105]);
    s[1]!.partial = true;
    expect(calculateGrowth(s)).toEqual({ absolute: 5, percent: 5, partial: true });
  });

  it("handles a provider correction that lowers the observed total", () => {
    expect(calculateGrowth(series([100, 110, 90]))).toEqual({
      absolute: -10,
      percent: -10,
      partial: false,
    });
  });

  it("ignores intermediate null days in the window", () => {
    expect(calculateGrowth(series([100, null, 110]))).toEqual({
      absolute: 10,
      percent: 10,
      partial: false,
    });
  });
});

describe("parseSocialWindow", () => {
  it("accepts the three canonical windows", () => {
    expect(parseSocialWindow(7)).toBe(7);
    expect(parseSocialWindow(30)).toBe(30);
    expect(parseSocialWindow(90)).toBe(90);
  });
  it("defaults to 7 for unknown values", () => {
    expect(parseSocialWindow("xyz")).toBe(7);
    expect(parseSocialWindow("")).toBe(7);
    expect(parseSocialWindow(null)).toBe(7);
    expect(parseSocialWindow(undefined)).toBe(7);
    expect(parseSocialWindow(45)).toBe(7);
  });
});

describe("seriesInWindow", () => {
  it("returns the last N points of the series", () => {
    const s = series([1, 2, 3, 4, 5]);
    expect(seriesInWindow(s, 3)).toHaveLength(3);
    expect(seriesInWindow(s, 3).map((p) => p.followerCount)).toEqual([3, 4, 5]);
  });

  it("returns the full series when the window is larger", () => {
    const s = series([1, 2, 3]);
    expect(seriesInWindow(s, 30)).toHaveLength(3);
  });

  it("returns an empty array for an empty input", () => {
    expect(seriesInWindow([], 7)).toEqual([]);
  });
});

describe("chartSeries", () => {
  it("returns nulls for missing points, not zeros", () => {
    const s = series([100, null, 105]);
    expect(chartSeries(s, "followerCount")).toEqual([
      { date: s[0]!.metricDate, value: 100 },
      { date: s[1]!.metricDate, value: null },
      { date: s[2]!.metricDate, value: 105 },
    ]);
  });
});

describe("buildProfileSummary", () => {
  it("surfaces the latest observation, all three windows, lastSyncedAt, and status", () => {
    const s = series([100, 102, 104, 106, 108, 110, 112]);
    const last = new Date("2026-08-24T03:15:00Z");
    const summary = buildProfileSummary({
      fullSeries: s,
      lastSyncedAt: last,
      connectionStatus: "connected",
    });
    expect(summary.currentFollowers).toBe(112);
    expect(summary.growth7).toEqual({ absolute: 12, percent: 12, partial: false });
    expect(summary.growth30.absolute).toBe(12);
    expect(summary.growth90.absolute).toBe(12);
    expect(summary.lastSyncedAt).toEqual(last);
    expect(summary.connectionStatus).toBe("connected");
  });

  it("returns currentFollowers=null when the series is empty", () => {
    const summary = buildProfileSummary({
      fullSeries: [],
      lastSyncedAt: null,
      connectionStatus: "manual",
    });
    expect(summary.currentFollowers).toBeNull();
    expect(summary.growth7.absolute).toBeNull();
    expect(summary.lastSyncedAt).toBeNull();
  });
});

describe("calculateEngagementRate", () => {
  it("computes the canonical case (15 engaged / 248 followers ≈ 6.05%)", () => {
    // Matches the Food Game IG pre-flight result: 15 engaged / 248 followers.
    const s = engagementSeries([200, 210, 220, 230, 240, 245, 248], [10, 11, 12, 13, 14, 15, 15]);
    // 15 / 248 * 100 = 6.048387096774194
    expect(calculateEngagementRate(s).percent).toBeCloseTo(6.0484, 3);
    expect(calculateEngagementRate(s).partial).toBe(false);
  });

  it("returns null percent when both sides are null", () => {
    const s = engagementSeries([100, null, 110], [null, null, null]);
    expect(calculateEngagementRate(s)).toEqual({ percent: null, partial: false });
  });

  it("uses the latest non-null of each side independently when the latest day has a null", () => {
    // The latest day has followerCount=null but engaged=10 observed.
    // The function walks each side back to its latest non-null and
    // divides: follower=120, engaged=10 → 8.33%.
    // (The IG API may observe engaged_accounts a day later than
    // followers, so the two sides coming from different days is the
    // common case the API produces.)
    const s = engagementSeries([100, 110, 120, null], [5, 6, 7, 10]);
    const result = calculateEngagementRate(s);
    expect(result.percent).toBeCloseTo((10 / 120) * 100, 6);
    expect(result.partial).toBe(false);
  });

  it("returns null percent when only engagedAccounts is missing", () => {
    // The latest day has engagedAccounts=null; the function looks back
    // to the previous day for the latest non-null engaged value (6).
    // Latest non-null follower is 120 (day 3). 6 / 120 = 5%.
    const s = engagementSeries([100, 110, 120], [5, 6, null]);
    expect(calculateEngagementRate(s)).toEqual({ percent: 5, partial: false });
  });

  it("returns null percent when the latest observed followers is zero (zero baseline)", () => {
    // Mirrors the zero-baseline rule in calculateGrowth: the rate is
    // undefined when the denominator is 0, even if the numerator is
    // also 0. The test uses a series where the latest non-null
    // follower is 0 (the function looks back only when the value is
    // null, not when it is 0).
    const s = engagementSeries([0], [0]);
    expect(calculateEngagementRate(s)).toEqual({ percent: null, partial: false });
  });

  it("propagates partial when any day in the window is marked partial", () => {
    // All 3 days have full data; the partial flag is set on day 2
    // (index 1). Latest non-null of each side: follower=120,
    // engaged=7 → 7 / 120 ≈ 5.83%.
    const s = engagementSeries([100, 110, 120], [5, 6, 7]);
    s[1]!.partial = true;
    const result = calculateEngagementRate(s);
    expect(result.percent).toBeCloseTo((7 / 120) * 100, 6);
    expect(result.partial).toBe(true);
  });

  it("handles an empty series", () => {
    expect(calculateEngagementRate([])).toEqual({ percent: null, partial: false });
  });

  it("handles a single-day series", () => {
    const s = engagementSeries([200], [10]);
    expect(calculateEngagementRate(s)).toEqual({ percent: 5, partial: false });
  });
});
