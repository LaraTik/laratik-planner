import { describe, expect, it } from "vitest";
import {
  buildCommandCenterSummary,
  COMMAND_CENTER_TIME_BAND_HOURS,
  toTimeBandHour,
  type CommandCenterChannel,
} from "@/lib/social/command-center";

function channel(
  id: string,
  accountName: string,
  rows: Array<[string, number | null, number | null, number | null, number | null, boolean?]>,
): CommandCenterChannel {
  return {
    id,
    platform: "instagram",
    accountName,
    lastSyncedAt: new Date("2026-09-30T10:00:00Z"),
    lastSyncErrorCode: null,
    latestProviderErrorCode: null,
    series: rows.map(([metricDate, followerCount, reach, views, interactions, partial]) => ({
      metricDate,
      followerCount,
      reach,
      views,
      engagedAccounts: null,
      interactions,
      ...(partial ? { partial: true } : {}),
    })),
  };
}

describe("buildCommandCenterSummary", () => {
  it("aggregates connected-account signals without inventing missing values", () => {
    const summary = buildCommandCenterSummary(
      [
        channel("one", "One", [
          ["2026-09-28", 100, 400, 900, 40],
          ["2026-09-29", 110, 450, 1_000, 50],
        ]),
        channel("two", "Two", [
          ["2026-09-28", 50, null, 500, 10],
          ["2026-09-29", 60, 300, 600, 20, true],
        ]),
      ],
      new Date("2026-09-30T12:00:00Z"),
    );

    expect(summary.channelCount).toBe(2);
    expect(summary.channelsWithData).toBe(2);
    expect(summary.currentFollowers).toBe(170);
    expect(summary.currentReach).toBe(750);
    expect(summary.currentViews).toBe(1_600);
    expect(summary.currentInteractions).toBe(70);
    expect(summary.followerGrowth).toMatchObject({ absolute: 20, percent: 13.333333333333334 });
    expect(summary.engagementRate.percent).toBeCloseTo(9.333, 2);
    expect(summary.partial).toBe(true);
    expect(summary.health).toEqual({ healthy: 2, degraded: 0, stalled: 0 });
    expect(summary.leaders.map((leader) => leader.accountName)).toEqual(["One", "Two"]);
    expect(summary.accountHealth).toEqual([
      expect.objectContaining({ accountName: "One", status: "healthy" }),
      expect.objectContaining({ accountName: "Two", status: "healthy" }),
    ]);
    expect(summary.channelPerformance[0]).toMatchObject({
      accountName: "One",
      followers: 110,
      reach: 450,
      views: 1_000,
      interactions: 50,
    });
  });

  it("keeps the trend and growth calculation inside the selected window", () => {
    const summary = buildCommandCenterSummary(
      [
        channel("one", "One", [
          ["2026-09-27", 100, 400, 900, 40],
          ["2026-09-28", 110, 450, 1_000, 50],
          ["2026-09-29", 130, 500, 1_200, 60],
        ]),
      ],
      new Date("2026-09-30T12:00:00Z"),
      [],
      "UTC",
      2,
    );

    expect(summary.trend.map((point) => point.metricDate)).toEqual(["2026-09-28", "2026-09-29"]);
    expect(summary.followerGrowth).toMatchObject({ absolute: 20, percent: 18.181818181818183 });
  });

  it("returns an honest empty state when no account has metric history", () => {
    const summary = buildCommandCenterSummary(
      [
        {
          ...channel("empty", "Empty", []),
          lastSyncedAt: null,
        },
      ],
      new Date("2026-09-30T12:00:00Z"),
    );

    expect(summary).toMatchObject({
      channelCount: 1,
      channelsWithData: 0,
      currentFollowers: null,
      currentReach: null,
      currentViews: null,
      currentInteractions: null,
      latestMetricDate: null,
      lastSyncedAt: null,
      health: { healthy: 0, degraded: 0, stalled: 1 },
      trend: [],
      leaders: [],
      channelPerformance: [],
    });
  });

  it("surfaces provider and freshness problems in the overview health summary", () => {
    const stale = channel("stale", "Stale", []);
    stale.lastSyncedAt = new Date("2026-09-28T00:00:00Z");
    const degraded = channel("degraded", "Degraded", []);
    degraded.latestProviderErrorCode = "metric_unavailable";

    const summary = buildCommandCenterSummary([stale, degraded], new Date("2026-09-30T12:00:00Z"));

    expect(summary.health).toEqual({ healthy: 0, degraded: 1, stalled: 1 });
    expect(summary.accountHealth).toEqual([
      expect.objectContaining({ accountName: "Stale", status: "stalled" }),
      expect.objectContaining({ accountName: "Degraded", status: "degraded" }),
    ]);
    expect(summary.partial).toBe(true);
  });

  it("ranks post observations and labels only strong sample outliers", () => {
    const summary = buildCommandCenterSummary(
      [channel("one", "One", [])],
      new Date("2026-09-30T12:00:00Z"),
      [
        {
          id: "post-1",
          channelId: "one",
          platform: "instagram",
          accountName: "One",
          permalink: "https://instagram.com/p/1",
          thumbnailUrl: null,
          caption: null,
          publishedAt: new Date("2026-09-29T10:00:00Z"),
          mediaType: "reel",
          views: 900,
          reach: null,
          likes: 20,
          comments: 3,
          saved: null,
          shares: null,
          interactions: 23,
          durationSeconds: null,
        },
        {
          id: "post-2",
          channelId: "one",
          platform: "instagram",
          accountName: "One",
          permalink: "https://instagram.com/p/2",
          thumbnailUrl: null,
          caption: null,
          publishedAt: new Date("2026-09-28T10:00:00Z"),
          mediaType: "video",
          views: 100,
          reach: null,
          likes: 2,
          comments: 0,
          saved: null,
          shares: null,
          interactions: 2,
          durationSeconds: null,
        },
        {
          id: "post-3",
          channelId: "one",
          platform: "instagram",
          accountName: "One",
          permalink: null,
          thumbnailUrl: null,
          caption: null,
          publishedAt: null,
          mediaType: "image",
          views: 100,
          reach: null,
          likes: null,
          comments: null,
          saved: null,
          shares: null,
          interactions: null,
          durationSeconds: null,
        },
        {
          id: "post-4",
          channelId: "one",
          platform: "instagram",
          accountName: "One",
          permalink: null,
          thumbnailUrl: null,
          caption: null,
          publishedAt: null,
          mediaType: "image",
          views: 100,
          reach: null,
          likes: null,
          comments: null,
          saved: null,
          shares: null,
          interactions: null,
          durationSeconds: null,
        },
      ],
    );

    expect(summary.content.sampleSize).toBe(4);
    expect(summary.content.averageViews).toBe(300);
    expect(summary.content.topPosts[0]?.id).toBe("post-1");
    expect(summary.content.outliers.map((post) => post.id)).toEqual(["post-1"]);
    expect(summary.content.outliers[0]?.outlierScore).toBe(3);
  });

  it("keeps engagement-only observations useful when views are unavailable", () => {
    const summary = buildCommandCenterSummary(
      [channel("page", "Page", [])],
      new Date("2026-09-30T12:00:00Z"),
      [
        {
          id: "fb-post",
          channelId: "page",
          platform: "facebook",
          accountName: "Page",
          permalink: "https://facebook.com/post-1",
          thumbnailUrl: null,
          caption: null,
          publishedAt: new Date("2026-09-29T10:00:00Z"),
          mediaType: "video",
          views: null,
          reach: null,
          likes: 10,
          comments: 3,
          saved: null,
          shares: 2,
          interactions: 15,
          durationSeconds: null,
        },
      ],
    );

    expect(summary.content.sampleSize).toBe(1);
    expect(summary.content.topPosts[0]?.id).toBe("fb-post");
    expect(summary.content.averageViews).toBeNull();
  });

  it("derives timezone-aware best-time and duration signals from observed posts", () => {
    const summary = buildCommandCenterSummary(
      [channel("one", "One", [])],
      new Date("2026-09-30T12:00:00Z"),
      [
        {
          id: "tue-1",
          channelId: "one",
          platform: "instagram",
          accountName: "One",
          permalink: null,
          thumbnailUrl: null,
          caption: null,
          publishedAt: new Date("2026-09-29T10:00:00Z"),
          mediaType: "reel",
          views: 900,
          reach: null,
          likes: null,
          comments: null,
          saved: null,
          shares: null,
          interactions: null,
          durationSeconds: 24,
        },
        {
          id: "tue-2",
          channelId: "one",
          platform: "instagram",
          accountName: "One",
          permalink: null,
          thumbnailUrl: null,
          caption: null,
          publishedAt: new Date("2026-09-29T10:15:00Z"),
          mediaType: "reel",
          views: 600,
          reach: null,
          likes: null,
          comments: null,
          saved: null,
          shares: null,
          interactions: null,
          durationSeconds: 20,
        },
        {
          id: "wed-1",
          channelId: "one",
          platform: "instagram",
          accountName: "One",
          permalink: null,
          thumbnailUrl: null,
          caption: null,
          publishedAt: new Date("2026-09-30T12:00:00Z"),
          mediaType: "reel",
          views: 100,
          reach: null,
          likes: null,
          comments: null,
          saved: null,
          shares: null,
          interactions: null,
          durationSeconds: 10,
        },
        {
          id: "wed-2",
          channelId: "one",
          platform: "instagram",
          accountName: "One",
          permalink: null,
          thumbnailUrl: null,
          caption: null,
          publishedAt: new Date("2026-09-30T12:15:00Z"),
          mediaType: "reel",
          views: 100,
          reach: null,
          likes: null,
          comments: null,
          saved: null,
          shares: null,
          interactions: null,
          durationSeconds: 8,
        },
        {
          id: "tue-3",
          channelId: "one",
          platform: "instagram",
          accountName: "One",
          permalink: null,
          thumbnailUrl: null,
          caption: null,
          publishedAt: new Date("2026-09-29T10:30:00Z"),
          mediaType: "reel",
          views: 500,
          reach: null,
          likes: null,
          comments: null,
          saved: null,
          shares: null,
          interactions: null,
          durationSeconds: 22,
        },
      ],
      "UTC",
    );

    // Slots are bucketed to the heatmap band start hour (06/09/12/15/18/21),
    // so the 10:00–10:30 Tuesday posts land in the 09:00 band and the
    // 12:00–12:15 Wednesday posts land in the 12:00 band.
    expect(summary.content.bestTime).toEqual({
      dayOfWeek: 2,
      hour: 9,
      sampleSize: 3,
      averageViews: 2_000 / 3,
      reliable: true,
    });
    expect(summary.content.timeSlots).toHaveLength(2);
    expect(
      summary.content.timeSlots.find((slot) => slot.dayOfWeek === 2 && slot.hour === 9),
    ).toEqual(summary.content.bestTime);
    expect(summary.content.lengthBands[0]).toMatchObject({
      key: "15to30",
      sampleSize: 3,
      medianViews: 600,
      relativePerformance: 2_000 / 3 / 440,
      reliable: true,
    });
    expect(summary.content.lengthBands[1]).toMatchObject({
      key: "under15",
      sampleSize: 2,
      medianViews: 100,
      reliable: false,
    });
  });

  it("does not recommend a timing slot until three observations support it", () => {
    const summary = buildCommandCenterSummary(
      [channel("one", "One", [])],
      new Date("2026-09-30T12:00:00Z"),
      [
        {
          id: "one",
          channelId: "one",
          platform: "instagram",
          accountName: "One",
          permalink: null,
          thumbnailUrl: null,
          caption: null,
          publishedAt: new Date("2026-09-29T10:00:00Z"),
          mediaType: "reel",
          views: 900,
          reach: null,
          likes: null,
          comments: null,
          saved: null,
          shares: null,
          interactions: null,
          durationSeconds: 20,
        },
        {
          id: "two",
          channelId: "one",
          platform: "instagram",
          accountName: "One",
          permalink: null,
          thumbnailUrl: null,
          caption: null,
          publishedAt: new Date("2026-09-29T10:15:00Z"),
          mediaType: "reel",
          views: 600,
          reach: null,
          likes: null,
          comments: null,
          saved: null,
          shares: null,
          interactions: null,
          durationSeconds: 20,
        },
      ],
      "UTC",
    );

    expect(summary.content.bestTime).toBeNull();
    expect(summary.content.lengthBands[0]).toMatchObject({
      sampleSize: 2,
      reliable: false,
    });
  });

  it("buckets off-row publish hours into a heatmap band the grid actually renders", () => {
    // Regression: slots used to be keyed by the EXACT published hour while
    // the heatmap only drew the 06/09/12/15/18/21 rows. A post at 14:23
    // created a slot no row could render, so the grid came out blank.
    // The 12:00 band covers 12:00–14:59, so 14:23 and 14:50 land in it.
    const summary = buildCommandCenterSummary(
      [channel("one", "One", [])],
      new Date("2026-09-30T12:00:00Z"),
      [
        {
          id: "off-row-1",
          channelId: "one",
          platform: "instagram",
          accountName: "One",
          permalink: null,
          thumbnailUrl: null,
          caption: null,
          publishedAt: new Date("2026-09-29T14:23:00Z"),
          mediaType: "reel",
          views: 800,
          reach: null,
          likes: null,
          comments: null,
          saved: null,
          shares: null,
          interactions: null,
          durationSeconds: 20,
        },
        {
          id: "off-row-2",
          channelId: "one",
          platform: "instagram",
          accountName: "One",
          permalink: null,
          thumbnailUrl: null,
          caption: null,
          publishedAt: new Date("2026-09-29T14:50:00Z"),
          mediaType: "reel",
          views: 400,
          reach: null,
          likes: null,
          comments: null,
          saved: null,
          shares: null,
          interactions: null,
          durationSeconds: 20,
        },
      ],
      "UTC",
    );

    expect(summary.content.timeSlots).toEqual([
      { dayOfWeek: 2, hour: 12, sampleSize: 2, averageViews: 600, reliable: false },
    ]);
  });

  it("folds pre-dawn publish hours into the first band instead of dropping them", () => {
    const summary = buildCommandCenterSummary(
      [channel("one", "One", [])],
      new Date("2026-09-30T12:00:00Z"),
      [
        {
          id: "early-1",
          channelId: "one",
          platform: "instagram",
          accountName: "One",
          permalink: null,
          thumbnailUrl: null,
          caption: null,
          publishedAt: new Date("2026-09-29T02:10:00Z"),
          mediaType: "reel",
          views: 300,
          reach: null,
          likes: null,
          comments: null,
          saved: null,
          shares: null,
          interactions: null,
          durationSeconds: 20,
        },
      ],
      "UTC",
    );

    expect(summary.content.timeSlots).toEqual([
      { dayOfWeek: 2, hour: 6, sampleSize: 1, averageViews: 300, reliable: false },
    ]);
  });

  it("maps every hour of the day onto a renderable band", () => {
    // Guards the band table itself: no hour may fall outside the six rows.
    const rendered = new Set<number>();
    for (let hour = 0; hour < 24; hour += 1) {
      const band = toTimeBandHour(hour);
      rendered.add(band);
      expect(COMMAND_CENTER_TIME_BAND_HOURS).toContain(
        band as (typeof COMMAND_CENTER_TIME_BAND_HOURS)[number],
      );
    }
    expect([...rendered].sort((a, b) => a - b)).toEqual([...COMMAND_CENTER_TIME_BAND_HOURS]);
  });
});
