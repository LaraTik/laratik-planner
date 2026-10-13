import { describe, expect, it } from "vitest";
import { buildAdvertisingReportView } from "@/lib/advertising/reporting-view";

describe("advertising reporting view", () => {
  it("rolls up authorized ad facts by day and campaign without averaging ratios", () => {
    const view = buildAdvertisingReportView([
      {
        accountId: "account",
        campaignId: "campaign-a",
        adId: "ad-a",
        date: "2026-10-01",
        spend: 10,
        impressions: 100,
        clicks: 5,
      },
      {
        accountId: "account",
        campaignId: "campaign-a",
        adId: "ad-a",
        date: "2026-10-02",
        spend: 30,
        impressions: 900,
        clicks: 45,
      },
      {
        accountId: "account",
        campaignId: "campaign-b",
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
  });

  it("keeps empty and zero-denominator metrics explicit", () => {
    expect(buildAdvertisingReportView([])).toEqual({
      dailySpend: [],
      campaigns: [],
      adCount: 0,
    });
  });
});
