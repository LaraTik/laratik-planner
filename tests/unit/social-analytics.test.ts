import { describe, expect, it } from "vitest";
import {
  buildProfileSummary,
  calculateEngagementRate,
  calculateGrowth,
  chartSeries,
  metricLabel,
  parseSocialMetric,
  parseSocialWindow,
  priorSeriesInWindow,
  seriesInWindow,
  SOCIAL_METRICS,
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
 * Engagement-rate test fixture. The second argument represents
 * `interactions`; reach mirrors the follower baseline so the test can
 * exercise the preferred reach denominator.
 * Pass `null` for either side to simulate a partial day.
 */
function engagementSeries(
  followers: Array<number | null>,
  interactions: Array<number | null>,
  dates?: string[],
): MetricSeriesPoint[] {
  return followers.map((f, i) => ({
    metricDate: dates?.[i] ?? `2026-08-${(i + 1).toString().padStart(2, "0")}`,
    followerCount: f,
    reach: f,
    views: null,
    engagedAccounts: null,
    interactions: interactions[i] ?? null,
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

  it("works for every supported metric field", () => {
    const s: MetricSeriesPoint[] = [
      {
        metricDate: "2026-08-01",
        followerCount: 1,
        reach: 10,
        views: 100,
        engagedAccounts: 5,
        interactions: 7,
      },
      {
        metricDate: "2026-08-02",
        followerCount: 2,
        reach: 20,
        views: 200,
        engagedAccounts: 6,
        interactions: 8,
      },
    ];
    expect(chartSeries(s, "followerCount").map((p) => p.value)).toEqual([1, 2]);
    expect(chartSeries(s, "reach").map((p) => p.value)).toEqual([10, 20]);
    expect(chartSeries(s, "views").map((p) => p.value)).toEqual([100, 200]);
    expect(chartSeries(s, "interactions").map((p) => p.value)).toEqual([7, 8]);
  });
});

describe("parseSocialMetric", () => {
  it("accepts the four universal metrics", () => {
    expect(parseSocialMetric("followerCount")).toBe("followerCount");
    expect(parseSocialMetric("reach")).toBe("reach");
    expect(parseSocialMetric("views")).toBe("views");
    expect(parseSocialMetric("interactions")).toBe("interactions");
    expect(parseSocialMetric("engagedAccounts")).toBe("followerCount");
  });
  it("defaults to followerCount for unknown / nullish values", () => {
    expect(parseSocialMetric("xyz")).toBe("followerCount");
    expect(parseSocialMetric("")).toBe("followerCount");
    expect(parseSocialMetric(null)).toBe("followerCount");
    expect(parseSocialMetric(undefined)).toBe("followerCount");
  });
});

describe("metricLabel", () => {
  it("returns a short label for every supported metric", () => {
    expect(metricLabel("followerCount")).toBe("Followers");
    expect(metricLabel("reach")).toBe("Reach");
    expect(metricLabel("views")).toBe("Views");
    expect(metricLabel("interactions")).toBe("Interactions");
  });
});

describe("SOCIAL_METRICS", () => {
  it("is the universal set of exactly four", () => {
    expect(SOCIAL_METRICS).toEqual(["followerCount", "reach", "views", "interactions"]);
  });
});

describe("priorSeriesInWindow", () => {
  it("returns the N days BEFORE the current N-day window", () => {
    const s = series([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // Current window = last 3 = [8, 9, 10]; prior window = [5, 6, 7]
    expect(priorSeriesInWindow(s, 3).map((p) => p.followerCount)).toEqual([5, 6, 7]);
  });

  it("returns the full available series when the prior window doesn't fit", () => {
    const s = series([1, 2, 3, 4, 5]);
    // Current window = last 3 = [3, 4, 5]; prior window would be
    // [0, 2] but we only have [1, 2] available → returns [1, 2].
    expect(priorSeriesInWindow(s, 3).map((p) => p.followerCount)).toEqual([1, 2]);
  });

  it("returns an empty array when the series is empty", () => {
    expect(priorSeriesInWindow([], 7)).toEqual([]);
  });

  it("returns an empty array when the series is shorter than the window", () => {
    const s = series([1, 2, 3]);
    expect(priorSeriesInWindow(s, 7)).toEqual([]);
  });

  it("supports a 30-day prior window (the M5 use case)", () => {
    const s = series(Array.from({ length: 60 }, (_, i) => 100 + i));
    const current = seriesInWindow(s, 30);
    const prior = priorSeriesInWindow(s, 30);
    expect(current).toHaveLength(30);
    expect(prior).toHaveLength(30);
    // Series is [100..159]. Current window = [130..159]
    // (last 30, indices 30..59). Prior window = [100..129]
    // (indices 0..29, the 30 days BEFORE the current window).
    expect(current[0]!.followerCount).toBe(130);
    expect(current[29]!.followerCount).toBe(159);
    expect(prior[0]!.followerCount).toBe(100);
    expect(prior[29]!.followerCount).toBe(129);
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
  it("computes the canonical case (15 interactions / 248 reach ≈ 6.05%)", () => {
    // Matches the Food Game IG pre-flight result: 15 interactions / 248 reach.
    const s = engagementSeries([200, 210, 220, 230, 240, 245, 248], [10, 11, 12, 13, 14, 15, 15]);
    // 15 / 248 * 100 = 6.048387096774194
    expect(calculateEngagementRate(s).percent).toBeCloseTo(6.0484, 3);
    expect(calculateEngagementRate(s).partial).toBe(false);
    expect(calculateEngagementRate(s).denominator).toBe("reach");
  });

  it("returns null percent when both sides are null", () => {
    const s = engagementSeries([100, null, 110], [null, null, null]);
    expect(calculateEngagementRate(s)).toEqual({
      percent: null,
      partial: true,
      denominator: null,
    });
  });

  it("uses the latest non-null of each side independently when the latest day has a null", () => {
    // The latest day has followerCount=null but interactions=10 observed.
    // The function walks each side back to its latest non-null and
    // divides: follower=120, engaged=10 → 8.33%.
    // Reach and followers may be observed on a different day than the
    // latest interaction count.
    const s = engagementSeries([100, 110, 120, null], [5, 6, 7, 10]);
    const result = calculateEngagementRate(s);
    expect(result.percent).toBeCloseTo((10 / 120) * 100, 6);
    expect(result.partial).toBe(false);
    expect(result.denominator).toBe("reach");
  });

  it("uses followers when reach is unavailable", () => {
    // Reach is unavailable, so the latest interactions value (6) is
    // divided by the latest follower total (120): 5%.
    const s = engagementSeries([100, 110, 120], [5, 6, null]);
    s.forEach((point) => {
      point.reach = null;
    });
    expect(calculateEngagementRate(s)).toEqual({
      percent: 5,
      partial: true,
      denominator: "followers",
    });
  });

  it("returns null percent when the latest observed followers is zero (zero baseline)", () => {
    // Mirrors the zero-baseline rule in calculateGrowth: the rate is
    // undefined when the denominator is 0, even if the numerator is
    // also 0. The test uses a series where the latest non-null
    // follower is 0 (the function looks back only when the value is
    // null, not when it is 0).
    const s = engagementSeries([0], [0]);
    expect(calculateEngagementRate(s)).toEqual({
      percent: null,
      partial: false,
      denominator: null,
    });
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
    expect(calculateEngagementRate([])).toEqual({
      percent: null,
      partial: false,
      denominator: null,
    });
  });

  it("handles a single-day series", () => {
    const s = engagementSeries([200], [10]);
    expect(calculateEngagementRate(s)).toEqual({
      percent: 5,
      partial: false,
      denominator: "reach",
    });
  });
});

import {
  csvFilename,
  escapeCsvCell,
  toCsv,
} from "@/app/(app)/app/w/[slug]/analytics/social/social-csv";

describe("toCsv", () => {
  it("omits Instagram-only engaged accounts from a Facebook export", () => {
    const csv = toCsv(
      [
        {
          metricDate: "2026-08-22",
          followerCount: 248,
          reach: 1200,
          views: 3400,
          engagedAccounts: 15,
          interactions: 42,
        },
      ],
      "facebook",
    );
    expect(csv.split("\n")).toEqual([
      "Date,Followers,Reach,Views,Interactions,Partial",
      "2026-08-22,248,1200,3400,42,",
    ]);
  });

  it("produces a header row followed by one row per input", () => {
    const csv = toCsv([
      {
        metricDate: "2026-08-22",
        followerCount: 248,
        reach: 1200,
        views: 3400,
        engagedAccounts: 15,
        interactions: 42,
      },
    ]);
    expect(csv.split("\n")).toEqual([
      "Date,Followers,Reach,Views,Engaged,Interactions,Partial",
      "2026-08-22,248,1200,3400,15,42,",
    ]);
  });

  it("emits blank cells for null values (not 'null' or '0')", () => {
    const csv = toCsv([
      {
        metricDate: "2026-08-22",
        followerCount: 248,
        reach: null,
        views: null,
        engagedAccounts: null,
        interactions: null,
      },
    ]);
    expect(csv).toContain("248,,,,,");
  });

  it("quotes values that contain a comma, quote, or newline", () => {
    expect(escapeCsvCell("plain")).toBe("plain");
    expect(escapeCsvCell("with,comma")).toBe('"with,comma"');
    expect(escapeCsvCell('with"quote')).toBe('"with""quote"');
    expect(escapeCsvCell("with\nnewline")).toBe('"with\nnewline"');
  });

  it("emits 'true' for partial rows and empty for non-partial", () => {
    const csv = toCsv([
      {
        metricDate: "2026-08-22",
        followerCount: 1,
        reach: null,
        views: null,
        engagedAccounts: null,
        interactions: null,
        partial: true,
      },
      {
        metricDate: "2026-08-23",
        followerCount: 2,
        reach: null,
        views: null,
        engagedAccounts: null,
        interactions: null,
      },
    ]);
    expect(csv.split("\n")[1]).toMatch(/,true$/);
    expect(csv.split("\n")[2]).toMatch(/,$/);
  });
});

describe("csvFilename", () => {
  it("slugifies the channel name and uses the date range", () => {
    expect(csvFilename("Food Game", "2026-08-22", "2026-08-28")).toBe(
      "social-analytics-food-game-2026-08-22_to_2026-08-28.csv",
    );
  });

  it("falls back to 'channel' when the name is empty after slugification", () => {
    expect(csvFilename("!!!", "2026-08-22", "2026-08-28")).toBe(
      "social-analytics-channel-2026-08-22_to_2026-08-28.csv",
    );
  });

  it("caps the slug at 40 characters", () => {
    const long = "a".repeat(60);
    const filename = csvFilename(long, "2026-08-22", "2026-08-28");
    // "social-analytics-" (17) + slug (40) + "-2026-08-22_to_2026-08-28.csv" (29)
    expect(filename.length).toBeLessThanOrEqual(17 + 40 + 29);
  });
});
