import { describe, expect, it } from "vitest";
import {
  buildComparisonSeries,
  commonMetricsForChannels,
  encodeAnalyticsSelection,
  filterAnalyticsChannels,
  parseAnalyticsSelection,
  type AnalyticsDashboardChannel,
} from "@/lib/social/analytics-dashboard";

function channel(
  id: string,
  platform: AnalyticsDashboardChannel["platform"],
  dates: string[] = ["2026-09-01", "2026-09-03"],
): AnalyticsDashboardChannel {
  return {
    id,
    platform,
    accountName: id,
    handle: null,
    lastSyncedAt: null,
    lastSyncErrorCode: null,
    latestProviderErrorCode: null,
    series: dates.map((metricDate, index) => ({
      metricDate,
      followerCount: index + 1,
      reach: 10 + index,
      views: 20 + index,
      engagedAccounts: null,
      interactions: 30 + index,
    })),
  };
}

describe("analytics dashboard selection model", () => {
  it("selects all channels by default and narrows by platform plus account", () => {
    const channels = [
      channel("fb", "facebook"),
      channel("ig", "instagram"),
      channel("tt", "tiktok"),
    ];
    expect(filterAnalyticsChannels(channels, [], [])).toHaveLength(3);
    expect(filterAnalyticsChannels(channels, ["facebook", "instagram"], ["ig"])).toEqual([
      channels[1],
    ]);
  });

  it("returns only metrics supported by every selected platform", () => {
    expect(
      commonMetricsForChannels([channel("fb", "facebook"), channel("ig", "instagram")]),
    ).toEqual(["followerCount", "reach", "views", "interactions"]);
    expect(commonMetricsForChannels([channel("fb", "facebook"), channel("tt", "tiktok")])).toEqual([
      "followerCount",
    ]);
  });

  it("round-trips URL selections without losing encoded account ids", () => {
    const query = encodeAnalyticsSelection({
      window: 30,
      metric: "interactions",
      platforms: ["facebook", "instagram"],
      channelIds: ["account/one", "account two"],
    });
    expect(query).toContain("platforms=facebook%2Cinstagram");
    expect(query).toContain("channels=account%2Fone%2Caccount+two");
    expect(parseAnalyticsSelection(`?${query}`)).toEqual({
      window: 30,
      metric: "interactions",
      platforms: ["facebook", "instagram"],
      channelIds: ["account/one", "account two"],
    });
  });

  it("builds a shared date axis with null gaps for each channel", () => {
    const result = buildComparisonSeries(
      [channel("fb", "facebook"), channel("ig", "instagram")],
      7,
      "reach",
    );
    expect(result.dates).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
    expect(result.lines[0]?.values).toEqual([10, null, 11]);
  });
});
