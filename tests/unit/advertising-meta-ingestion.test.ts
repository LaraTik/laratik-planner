import { describe, expect, it } from "vitest";
import {
  normalizeMetaAccountInsights,
  normalizeMetaAdInsights,
  normalizeMetaBreakdownInsights,
  sumSpendValues,
} from "@/lib/advertising/meta-ingestion";

const context = {
  definitionVersion: "meta-read-v1",
  provider: "meta" as const,
  accountId: "act_123",
  currency: "EUR",
  timezone: "Europe/Berlin",
  dateRange: { since: "2026-10-01", until: "2026-10-02" },
  attributionWindow: "7d_click",
  actionReportTime: "impression",
  breakdowns: [],
  grain: "ad_day" as const,
};

describe("Meta ad-level ingestion normalization", () => {
  it("keeps explicit provider identities and attribution context", () => {
    expect(
      normalizeMetaAdInsights(
        {
          data: [
            {
              ad_id: "ad_1",
              adset_id: "adset_1",
              campaign_id: "campaign_1",
              date_start: "2026-10-01",
              spend: "12.345678",
              impressions: "100",
              clicks: 5,
            },
          ],
        },
        context,
      ),
    ).toEqual({
      observations: [
        {
          externalAdId: "ad_1",
          externalAdSetId: "adset_1",
          externalCampaignId: "campaign_1",
          reportDate: "2026-10-01",
          currency: "EUR",
          spend: "12.345678",
          impressions: 100,
          clicks: 5,
          reach: null,
          results: null,
          resultType: null,
          resultActions: null,
          attributionWindow: "7d_click",
          actionReportTime: "impression",
        },
      ],
      skippedRows: 0,
      partial: false,
    });
  });

  it("skips incomplete rows instead of fabricating ownership or metrics", () => {
    const result = normalizeMetaAdInsights(
      { data: [{ date_start: "2026-10-01", spend: "4", impressions: "10", clicks: "1" }] },
      context,
    );
    expect(result).toEqual({ observations: [], skippedRows: 1, partial: true });
  });

  it("normalizes explicit and single-type action results without guessing heterogeneous totals", () => {
    const result = normalizeMetaAdInsights(
      {
        data: [
          {
            ad_id: "ad_1",
            campaign_id: "campaign_1",
            date_start: "2026-10-01",
            spend: "4",
            impressions: "10",
            clicks: "1",
            reach: "9",
            results: "3",
            result_type: "link_click",
          },
          {
            ad_id: "ad_2",
            campaign_id: "campaign_1",
            date_start: "2026-10-01",
            spend: "5",
            impressions: "20",
            clicks: "2",
            actions: [
              { action_type: "lead", value: "2" },
              { action_type: "lead", value: "1" },
            ],
          },
          {
            ad_id: "ad_3",
            campaign_id: "campaign_1",
            date_start: "2026-10-01",
            spend: "6",
            impressions: "30",
            clicks: "3",
            actions: [
              { action_type: "lead", value: "2" },
              { action_type: "purchase", value: "1" },
            ],
          },
        ],
      },
      context,
    );
    expect(result.observations[0]).toMatchObject({
      results: 3,
      resultType: "link_click",
      reach: 9,
    });
    expect(result.observations[1]).toMatchObject({
      results: 3,
      resultType: "lead",
      resultActions: { lead: 3 },
    });
    expect(result.observations[2]).toMatchObject({
      results: null,
      resultType: null,
      resultActions: { lead: 2, purchase: 1 },
    });
  });

  it("rejects non-canonical breakdowns and non-ad grains", () => {
    expect(() =>
      normalizeMetaAdInsights({ data: [] }, { ...context, breakdowns: ["age"] }),
    ).toThrow("meta_ad_insights_breakdowns_not_canonical");
    expect(() =>
      normalizeMetaAdInsights({ data: [] }, { ...context, grain: "account_day" }),
    ).toThrow("meta_ad_insights_grain_required");
  });

  it("normalizes account totals without assigning them to a workspace", () => {
    expect(
      normalizeMetaAccountInsights({
        data: [{ date_start: "2026-10-01", spend: "10.25" }],
      }),
    ).toEqual({
      rows: [{ reportDate: "2026-10-01", spend: "10.25" }],
      skippedRows: 0,
      partial: false,
    });
    expect(sumSpendValues(["10.25", "0.000001", "1.75"])).toBe("12.000001");
  });

  it("keeps provider-returned audience dimensions separate and explicit", () => {
    const result = normalizeMetaBreakdownInsights(
      {
        data: [
          {
            date_start: "2026-10-01",
            age: "25-34",
            gender: "female",
            spend: "4.50",
            impressions: "100",
            reach: "80",
          },
        ],
      },
      { ...context, breakdowns: ["age", "gender"], grain: "account_day" },
    );
    expect(result.observations).toEqual([
      expect.objectContaining({ breakdown: "age", dimensionValue: "25-34" }),
      expect.objectContaining({ breakdown: "gender", dimensionValue: "female" }),
    ]);
    expect(result.partial).toBe(false);
  });
});
