import { describe, expect, it } from "vitest";
import {
  buildProfileSummary,
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
