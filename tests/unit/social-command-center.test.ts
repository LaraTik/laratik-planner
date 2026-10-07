import { describe, expect, it } from "vitest";
import {
  buildCommandCenterSummary,
  COMMAND_CENTER_TIME_BAND_HOURS,
  commandCenterConfidence,
  toTimeBandHour,
  type CommandCenterChannel,
  type CommandCenterPost,
} from "@/lib/social/command-center";

/** One post observation published at an exact ISO instant. */
function observation(id: string, views: number, publishedAt: string): CommandCenterPost {
  return {
    id,
    channelId: "one",
    platform: "instagram",
    accountName: "One",
    permalink: null,
    thumbnailUrl: null,
    caption: null,
    publishedAt: new Date(publishedAt),
    mediaType: "reel",
    views,
    reach: null,
    likes: null,
    comments: null,
    saved: null,
    shares: null,
    interactions: null,
    durationSeconds: 20,
  };
}

/** Tuesday (dayOfWeek 2) in the 09:00 band. */
const tue9 = (id: string, views: number) => observation(id, views, "2026-09-29T09:10:00Z");
/** Tuesday (dayOfWeek 2) in the 15:00 band. */
const tue15 = (id: string, views: number) => observation(id, views, "2026-09-29T15:10:00Z");
/** Friday (dayOfWeek 5) in the 12:00 band. */
const fri12 = (id: string, views: number) => observation(id, views, "2026-10-02T12:10:00Z");

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
    // Flows are SUMMED over the window and the follower stock is taken from
    // the last known day. These used to be the latest single day, which made
    // the panel contradict the window its own header named.
    expect(summary.channelPerformance[0]).toMatchObject({
      accountName: "One",
      followers: 110,
      reach: 850,
      views: 1_900,
      interactions: 90,
    });
    // One: 90 interactions / 850 reach. Two: 30 / 300. Both reach-based.
    expect(summary.leaders[0]?.rate).toMatchObject({
      percent: (90 / 850) * 100,
      denominator: "reach",
      interactions: 90,
      denominatorValue: 850,
      daysObserved: 2,
      metricDate: "2026-09-29",
    });
  });

  it("ranks strongest accounts on the rate it displays, and never mixes bases", () => {
    // The regression this pins. Ranking used `views ?? interactions ?? reach`
    // per row while rendering `interactions ?? views`, so the order and the
    // printed number were different quantities: an account with views=100 and
    // interactions=2 outranked one with views=null and interactions=50 and then
    // printed 2 above 50. Meta reports views for Instagram but not for a
    // Facebook Page, so this is the common case, not a corner case.
    const summary = buildCommandCenterSummary(
      [
        // Big on views, tiny on interactions -> high reach, terrible rate.
        {
          ...channel("reachy", "Reachy", [["2026-09-29", 100, 1_000, 100, 2]]),
          platform: "instagram",
        },
        // No views at all, but a genuinely strong rate.
        {
          ...channel("engaged", "Engaged", [["2026-09-29", 100, 400, null, 50]]),
          platform: "facebook",
        },
      ],
      new Date("2026-09-30T12:00:00Z"),
      [],
      "UTC",
    );

    // The engaged Page wins on rate despite having no views to sort on.
    expect(summary.leaders.map((leader) => leader.accountName)).toEqual(["Engaged", "Reachy"]);
    // And the displayed rate is strictly descending — order equals the number.
    const percents = summary.leaders.map((leader) => leader.rate.percent ?? -1);
    expect(percents[0]).toBeGreaterThan(percents[1]!);
    expect(summary.leaders[0]?.rate.percent).toBeCloseTo((50 / 400) * 100, 6);
    expect(summary.leaders[1]?.rate.percent).toBeCloseTo((2 / 1_000) * 100, 6);
  });

  it("falls back to followers and names the denominator it used", () => {
    const summary = buildCommandCenterSummary(
      [
        {
          ...channel("page", "Page", [["2026-09-29", 800, null, null, 40]]),
          platform: "facebook",
        },
      ],
      new Date("2026-09-30T12:00:00Z"),
      [],
      "UTC",
    );

    expect(summary.leaders[0]?.rate).toMatchObject({
      denominator: "followers",
      percent: 5,
      interactions: 40,
      denominatorValue: 800,
    });
  });

  it("excludes an account it cannot compute a rate for rather than showing a fake zero", () => {
    const summary = buildCommandCenterSummary(
      [
        channel("ghost", "Ghost", [["2026-09-29", null, null, 900, null]]),
        channel("real", "Real", [["2026-09-29", 100, 500, 900, 25]]),
      ],
      new Date("2026-09-30T12:00:00Z"),
      [],
      "UTC",
    );

    expect(summary.leaders.map((leader) => leader.accountName)).toEqual(["Real"]);
  });

  it("stops reordering channel performance when the strongest accounts re-rank", () => {
    // `leaders` used to be a slice of `channelPerformance`, so the two panels
    // shared one sort. They are now ranked independently: this panel's bars
    // are views, so an account with no views must not outrank one that has them.
    const summary = buildCommandCenterSummary(
      [
        channel("noViews", "NoViews", [["2026-09-29", 50, 400, null, 50]]),
        channel("views", "Views", [["2026-09-29", 100, 500, 1_200, 25]]),
      ],
      new Date("2026-09-30T12:00:00Z"),
      [],
      "UTC",
    );

    expect(summary.channelPerformance.map((c) => c.accountName)).toEqual(["Views", "NoViews"]);
    // ...while the strongest-accounts ranking still prefers the higher rate.
    expect(summary.leaders.map((c) => c.accountName)).toEqual(["NoViews", "Views"]);
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
      // Baseline across all six posts is 440, so the lift and the tier are
      // derived rather than left to the caller.
      liftRatio: 2_000 / 3 / 440,
      confidence: "low",
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
      {
        dayOfWeek: 2,
        hour: 12,
        sampleSize: 2,
        averageViews: 600,
        reliable: false,
        // The only posts in the window, so the baseline IS this cell: a lift of
        // exactly 1.0 and therefore the floor tier, not a recommendation.
        liftRatio: 1,
        confidence: "low",
      },
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
      {
        dayOfWeek: 2,
        hour: 6,
        sampleSize: 1,
        averageViews: 300,
        reliable: false,
        liftRatio: 1,
        confidence: "low",
      },
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

  it("carries lift and a confidence tier on the recommended slot", () => {
    // Four Tuesday-afternoon posts well above the workspace average, plus a
    // spread of other posts to form a realistic baseline.
    const observations = [
      ...[900, 900, 900, 900].map((views, index) => tue15(`tue-${index}`, views)),
      ...[100, 100, 100, 100, 100].map((views, index) => tue9(`other-${index}`, views)),
    ];
    const summary = buildCommandCenterSummary(
      [channel("one", "One", [])],
      new Date("2026-09-30T12:00:00Z"),
      observations,
      "UTC",
    );

    const best = summary.content.bestTime;
    expect(best).toMatchObject({ dayOfWeek: 2, hour: 15, sampleSize: 4, averageViews: 900 });
    // Baseline = (4*900 + 5*100) / 9 = 455.6 -> lift 900/455.6 = 1.976
    expect(best?.liftRatio).toBeCloseTo(900 / (4_100 / 9), 3);
    // n=4 clears the gate but not the "good" threshold of 8.
    expect(best?.confidence).toBe("low");
  });

  it("raises the tier with sample size and never on lift alone", () => {
    expect(commandCenterConfidence(3, 2)).toBe("low");
    expect(commandCenterConfidence(5, 2)).toBe("early");
    expect(commandCenterConfidence(8, 2)).toBe("good");
    // A slot barely above average drops exactly one step, never to the floor
    // and never two — n=20 with a 2% lift is still "early", not "low".
    expect(commandCenterConfidence(20, 1.02)).toBe("early");
    expect(commandCenterConfidence(20, 1.1)).toBe("early");
    expect(commandCenterConfidence(20, 1.2)).toBe("good");
    // Already at the floor, a marginal lift cannot take it lower.
    expect(commandCenterConfidence(3, 1.02)).toBe("low");
    // No baseline to compare against leaves the sample-size tier alone.
    expect(commandCenterConfidence(20, null)).toBe("good");
  });

  it("rings the same slot the panel recommends, using the domain's own choice", () => {
    // The end-to-end shape of the reported bug: one loud single post and one
    // well-supported slot. The pill must be the supported slot, and the grid's
    // highlighted cell must be that same slot — never the louder outlier.
    const observations = [
      ...[900, 900, 900].map((views, index) => tue15(`tue-${index}`, views)),
      fri12("fri-loud", 5_000),
    ];
    const summary = buildCommandCenterSummary(
      [channel("one", "One", [])],
      new Date("2026-09-30T12:00:00Z"),
      observations,
      "UTC",
    );

    const best = summary.content.bestTime;
    expect(best).toMatchObject({ dayOfWeek: 2, hour: 15, sampleSize: 3 });
    // The loud cell exists, tops the raw grid, and is still not recommended.
    const loudest = [...summary.content.timeSlots].sort(
      (a, b) => b.averageViews - a.averageViews,
    )[0];
    expect(loudest).toMatchObject({ dayOfWeek: 5, hour: 12, reliable: false });
    expect(best?.dayOfWeek).not.toBe(loudest?.dayOfWeek);
    expect(best?.hour).not.toBe(loudest?.hour);
  });
});
