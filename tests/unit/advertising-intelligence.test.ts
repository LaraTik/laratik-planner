import { describe, expect, it } from "vitest";
import {
  buildBudgetPacingInsights,
  buildCampaignPerformanceInsights,
  buildCreativeFatigueInsights,
} from "@/lib/advertising/intelligence";

describe("advertising intelligence", () => {
  it("identifies effective and underperforming campaigns against the authorized peer set", () => {
    const insights = buildCampaignPerformanceInsights([
      {
        campaignId: "effective",
        name: "Effective",
        spend: 100,
        impressions: 10_000,
        clicks: 500,
        results: null,
        ctr: 0.05,
        cpc: 0.2,
        cpm: 10,
        adCount: 1,
      },
      {
        campaignId: "underperforming",
        name: "Underperforming",
        spend: 100,
        impressions: 10_000,
        clicks: 100,
        results: null,
        ctr: 0.01,
        cpc: 1,
        cpm: 10,
        adCount: 1,
      },
    ]);
    expect(insights).toEqual([
      expect.objectContaining({ campaignId: "effective", status: "effective" }),
      expect.objectContaining({ campaignId: "underperforming", status: "underperforming" }),
    ]);
  });

  it("does not invent a lifetime-budget pace without campaign dates", () => {
    const insights = buildBudgetPacingInsights(
      [
        {
          campaignId: "daily",
          name: "Daily",
          spend: 120,
          impressions: 1,
          clicks: 1,
          results: null,
          ctr: 1,
          cpc: 120,
          cpm: 120_000,
          adCount: 1,
          dailyBudget: "100",
        },
        {
          campaignId: "lifetime",
          name: "Lifetime",
          spend: 120,
          impressions: 1,
          clicks: 1,
          results: null,
          ctr: 1,
          cpc: 120,
          cpm: 120_000,
          adCount: 1,
          lifetimeBudget: "1000",
        },
      ],
      "2026-10-01",
      "2026-10-01",
    );
    expect(insights[0]).toMatchObject({ status: "over", expectedSpend: 100, paceRatio: 1.2 });
    expect(insights[1]).toMatchObject({ status: "unavailable", expectedSpend: null });
  });

  it("flags creative fatigue only when both comparison periods have enough data", () => {
    const rows = [
      {
        accountId: "account",
        campaignId: "campaign",
        adId: "fatiguing",
        date: "2026-10-01",
        spend: 100,
        impressions: 1_000,
        clicks: 100,
      },
      {
        accountId: "account",
        campaignId: "campaign",
        adId: "fatiguing",
        date: "2026-10-03",
        spend: 100,
        impressions: 1_000,
        clicks: 50,
      },
      {
        accountId: "account",
        campaignId: "campaign",
        adId: "small",
        date: "2026-10-01",
        spend: 10,
        impressions: 50,
        clicks: 5,
      },
      {
        accountId: "account",
        campaignId: "campaign",
        adId: "small",
        date: "2026-10-03",
        spend: 10,
        impressions: 50,
        clicks: 1,
      },
    ];
    const insights = buildCreativeFatigueInsights(
      rows,
      [
        {
          adId: "fatiguing",
          adSetId: "adset",
          campaignId: "campaign",
          name: "Fatiguing",
          spend: 200,
          impressions: 2_000,
          clicks: 150,
          results: null,
          ctr: 0.075,
          cpc: 1.333,
          cpm: 100,
        },
        {
          adId: "small",
          adSetId: "adset",
          campaignId: "campaign",
          name: "Small",
          spend: 20,
          impressions: 100,
          clicks: 6,
          results: null,
          ctr: 0.06,
          cpc: 3.333,
          cpm: 200,
        },
      ],
      "2026-10-01",
      "2026-10-04",
    );
    expect(insights[0]).toMatchObject({ status: "fatiguing", priorImpressions: 1000 });
    expect(insights[1]).toMatchObject({ status: "insufficient_data" });
  });
});
