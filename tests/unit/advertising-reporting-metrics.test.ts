import { describe, expect, it } from "vitest";
import { aggregateAdvertisingMetrics, metricStatuses } from "@/lib/advertising/reporting-metrics";
import { buildComparisonSummary, comparisonRange } from "@/lib/advertising/reporting-comparison";
import type { AdvertisingFact } from "@/lib/advertising/reporting-service";

const row = (overrides: Partial<AdvertisingFact> = {}): AdvertisingFact => ({
  accountId: "account-1",
  campaignId: "campaign-1",
  adId: "ad-1",
  date: "2026-10-01",
  spend: 10,
  impressions: 1_000,
  clicks: 100,
  reach: 500,
  results: 10,
  resultType: "link_click",
  resultActions: { link_click: 50, outbound_click: 25 },
  ...overrides,
});

describe("advertising reporting metrics", () => {
  it("recalculates rates from aggregate numerators and does not sum reach", () => {
    const metrics = aggregateAdvertisingMetrics([
      row(),
      row({ adId: "ad-2", spend: 20, impressions: 2_000, clicks: 200, reach: 500 }),
    ]);
    expect(metrics.spend).toBe(30);
    expect(metrics.ctrAll).toBeCloseTo(0.1);
    expect(metrics.cpm).toBe(10);
    expect(metrics.reach).toBe(500);
    expect(metrics.frequency).toBe(6);
    expect(metrics.resultType).toBe("link_click");
  });

  it("keeps objective-aware results and action metrics explainable", () => {
    const metrics = aggregateAdvertisingMetrics([
      row(),
      row({ results: null, resultActions: null }),
    ]);
    expect(metrics.results).toBeNull();
    expect(metrics.linkClicks).toBeNull();
    expect(metricStatuses(metrics).find((status) => status.key === "reach")?.availability).toBe(
      "available",
    );
  });

  it("does not combine incompatible result types", () => {
    const metrics = aggregateAdvertisingMetrics([
      row({ resultType: "link_click" }),
      row({ adId: "ad-2", resultType: "purchase" }),
    ]);
    expect(metrics.results).toBeNull();
    expect(metrics.costPerResult).toBeNull();
  });

  it("does not combine typed results with rows that have no result definition", () => {
    const metrics = aggregateAdvertisingMetrics([
      row({ resultType: "link_click" }),
      row({ adId: "ad-2", resultType: null }),
    ]);
    expect(metrics.results).toBeNull();
    expect(metrics.costPerResult).toBeNull();
  });

  it("marks metrics partial when the report health is partial", () => {
    const metrics = aggregateAdvertisingMetrics([row()]);
    expect(
      metricStatuses(metrics, { healthState: "partial" }).find((status) => status.key === "spend"),
    ).toMatchObject({ availability: "partial", label: "Spend" });
  });

  it("returns matching previous period boundaries", () => {
    expect(comparisonRange({ since: "2026-10-01", until: "2026-10-07", mode: "previous" })).toEqual(
      { since: "2026-09-24", until: "2026-09-30" },
    );
  });

  it("marks lower cost as favorable", () => {
    const primary = aggregateAdvertisingMetrics([row({ spend: 8 })]);
    const comparison = aggregateAdvertisingMetrics([row({ spend: 10 })]);
    expect(
      buildComparisonSummary({
        mode: "previous",
        since: "2026-10-01",
        until: "2026-10-01",
        primary,
        comparison,
      }).deltas.costPerResult?.favorable,
    ).toBe(true);
  });
});
