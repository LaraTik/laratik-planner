import { describe, expect, it } from "vitest";
import { buildAdvertisingReportView } from "@/lib/advertising/reporting-view";

describe("advertising reporting view", () => {
  it("rolls up authorized ad facts by day and campaign without averaging ratios", () => {
    const view = buildAdvertisingReportView([
      {
        accountId: "account",
        campaignId: "campaign-a",
        adSetId: "adset-a",
        adId: "ad-a",
        date: "2026-10-01",
        spend: 10,
        impressions: 100,
        clicks: 5,
      },
      {
        accountId: "account",
        campaignId: "campaign-a",
        adSetId: "adset-a",
        adId: "ad-a",
        date: "2026-10-02",
        spend: 30,
        impressions: 900,
        clicks: 45,
      },
      {
        accountId: "account",
        campaignId: "campaign-b",
        adSetId: "adset-b",
        adId: "ad-b",
        date: "2026-10-02",
        spend: 60,
        impressions: 100,
        clicks: 1,
      },
    ]);
    expect(view.dailySpend).toEqual([
      { date: "2026-10-01", spend: 10 },
      { date: "2026-10-02", spend: 90 },
    ]);
    expect(view.adCount).toBe(2);
    expect(view.activeAdCount).toBeNull();
    expect(view.campaigns[0]).toMatchObject({
      campaignId: "campaign-b",
      spend: 60,
      impressions: 100,
      clicks: 1,
      ctr: 0.01,
      cpc: 60,
      cpm: 600,
      adCount: 1,
    });
    expect(view.campaigns[1]).toMatchObject({
      campaignId: "campaign-a",
      spend: 40,
      impressions: 1000,
      clicks: 50,
      ctr: 0.05,
      cpc: 0.8,
      cpm: 40,
      adCount: 1,
    });
    expect(view.adSets).toHaveLength(2);
    expect(view.ads).toHaveLength(2);
  });

  it("keeps empty and zero-denominator metrics explicit", () => {
    expect(buildAdvertisingReportView([])).toEqual({
      dailySpend: [],
      campaigns: [],
      adSets: [],
      ads: [],
      adCount: 0,
      activeAdCount: null,
    });
  });

  it("keeps campaign results unavailable when provider result types are mixed", () => {
    const view = buildAdvertisingReportView([
      {
        accountId: "account",
        campaignId: "campaign",
        adSetId: "adset",
        adId: "ad-a",
        date: "2026-10-01",
        spend: 10,
        impressions: 100,
        clicks: 5,
        results: 2,
        resultType: "lead",
      },
      {
        accountId: "account",
        campaignId: "campaign",
        adSetId: "adset",
        adId: "ad-b",
        date: "2026-10-01",
        spend: 20,
        impressions: 200,
        clicks: 10,
        results: 1,
        resultType: "purchase",
      },
    ]);

    expect(view.campaigns[0]?.results).toBeNull();
    expect(view.ads.every((ad) => ad.results !== null)).toBe(true);
  });

  it("deduplicates multiple ads that promote the same exact post", () => {
    const view = buildAdvertisingReportView(
      [
        {
          accountId: "account",
          campaignId: "campaign",
          adSetId: "adset",
          adId: "ad-a",
          date: "2026-10-01",
          spend: 10,
          impressions: 100,
          clicks: 5,
        },
        {
          accountId: "account",
          campaignId: "campaign",
          adSetId: "adset",
          adId: "ad-b",
          date: "2026-10-01",
          spend: 20,
          impressions: 200,
          clicks: 10,
        },
      ],
      [
        {
          objectType: "ad",
          externalObjectId: "ad-a",
          parentExternalObjectId: "adset",
          name: null,
          status: "ACTIVE",
          objective: null,
          dailyBudget: null,
          lifetimeBudget: null,
          promotedPostId: "post-1",
        },
        {
          objectType: "creative",
          externalObjectId: "creative-a",
          parentExternalObjectId: "ad-a",
          name: "Boundaries carousel",
          status: null,
          objective: null,
          dailyBudget: null,
          lifetimeBudget: null,
          promotedPostId: null,
          metadata: {
            format: "carousel",
            previewUrl: "https://cdn.example.test/creative-a.jpg",
            headline: "Set better boundaries",
          },
        },
        {
          objectType: "ad",
          externalObjectId: "ad-b",
          parentExternalObjectId: "adset",
          name: null,
          status: "ACTIVE",
          objective: null,
          dailyBudget: null,
          lifetimeBudget: null,
          promotedPostId: "post-1",
        },
      ],
    );
    expect(view.promotedPosts).toEqual([
      expect.objectContaining({ postId: "post-1", adCount: 2, spend: 30, impressions: 300 }),
    ]);
    expect(view.ads.find((ad) => ad.adId === "ad-a")?.creativeMetadata).toEqual({
      format: "carousel",
      previewUrl: "https://cdn.example.test/creative-a.jpg",
      headline: "Set better boundaries",
    });
    expect(view.activeAdCount).toBe(2);
  });
});
