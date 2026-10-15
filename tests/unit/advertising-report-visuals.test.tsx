import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdvertisingReportVisuals } from "@/app/(app)/app/a/[agencySlug]/w/[slug]/analytics/advertising/advertising-report-visuals";

describe("AdvertisingReportVisuals", () => {
  it("renders an accessible spend trend and objective breakdown from authorized facts", () => {
    render(
      <AdvertisingReportVisuals
        dailySpend={[
          { date: "2026-10-01", spend: 20 },
          { date: "2026-10-02", spend: 40 },
        ]}
        campaigns={[
          {
            campaignId: "campaign-sales",
            name: "Sales",
            objective: "Sales",
            spend: 40,
            impressions: 1000,
            clicks: 20,
            results: 4,
            ctr: 0.02,
            cpc: 2,
            cpm: 40,
            adCount: 1,
          },
          {
            campaignId: "campaign-leads",
            name: "Leads",
            objective: "Leads",
            spend: 20,
            impressions: 800,
            clicks: 16,
            results: 2,
            ctr: 0.02,
            cpc: 1.25,
            cpm: 25,
            adCount: 1,
          },
        ]}
        currency="EUR"
        locale="en"
        labels={{
          spendTrendTitle: "Performance trend",
          spendTrendDescription: "Daily spend",
          spendTrendAccessible: "Daily spend trend chart",
          trendLineLabel: "Trend",
          performanceByObjectiveTitle: "Performance by objective",
          performanceByObjectiveDescription: "Spend distribution",
          noSpendData: "No spend",
          noObjectiveData: "No objectives",
          unknownObjective: "Unspecified",
          totalSpend: "Total spend",
          legendSpend: "Spend",
          spendMetric: "Spend",
        }}
      />,
    );

    expect(screen.getByTestId("advertising-reporting-daily-spend")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Daily spend trend chart" })).toBeInTheDocument();
    expect(screen.getByTestId("advertising-reporting-objectives")).toHaveTextContent("Sales");
    expect(screen.getByTestId("advertising-reporting-objectives")).toHaveTextContent("Leads");
    expect(screen.getAllByText("€60.00")).toHaveLength(2);
  });
});
