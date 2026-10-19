import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdvertisingHierarchyExplorer } from "@/app/(app)/app/a/[agencySlug]/w/[slug]/analytics/advertising/advertising-hierarchy-explorer";

const labels = {
  title: "Campaign explorer",
  description: "Expand hierarchy",
  campaign: "Campaign",
  adSet: "Ad set",
  ad: "Ad",
  spend: "Spend",
  results: "Results",
  ctr: "CTR",
  delivery: "Delivery",
  expand: "Expand",
  collapse: "Collapse",
  noChildren: "No child entities",
  unavailable: "Not available",
  tableLabel: "Campaign performance",
  active: "Active",
  columns: "Columns",
  sort: "Sort",
  sortName: "Name",
  sortSpend: "Spend",
  sortResults: "Results",
  sortCtr: "CTR",
} as const;

const metrics = {
  spend: 10,
  impressions: 100,
  clicks: 5,
  results: 2,
  ctr: 0.05,
  cpc: 2,
  cpm: 100,
} as const;

describe("AdvertisingHierarchyExplorer", () => {
  it("expands campaign, ad set, and ad rows without showing descendants by default", () => {
    render(
      <AdvertisingHierarchyExplorer
        campaigns={[{ ...metrics, campaignId: "campaign-1", adCount: 1, name: "Campaign 1" }]}
        adSets={[
          {
            ...metrics,
            adSetId: "adset-1",
            campaignId: "campaign-1",
            adCount: 1,
            name: "Ad set 1",
          },
        ]}
        ads={[
          {
            ...metrics,
            adId: "ad-1",
            adSetId: "adset-1",
            campaignId: "campaign-1",
            name: "Ad 1",
          },
        ]}
        currency="EUR"
        locale="en"
        labels={labels}
      />,
    );

    expect(screen.getByText("Campaign 1")).toBeInTheDocument();
    expect(screen.queryByText("Ad set 1")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand: Campaign 1" }));
    expect(screen.getByText("Ad set 1")).toBeInTheDocument();
    expect(screen.queryByText("Ad 1")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand: Ad set 1" }));
    expect(screen.getByText("Ad 1")).toBeInTheDocument();
  });

  it("sorts campaigns by the selected metric", () => {
    render(
      <AdvertisingHierarchyExplorer
        campaigns={[
          { ...metrics, campaignId: "campaign-1", adCount: 0, name: "Lower results", results: 2 },
          { ...metrics, campaignId: "campaign-2", adCount: 0, name: "Higher results", results: 8 },
        ]}
        adSets={[]}
        ads={[]}
        currency="EUR"
        locale="en"
        labels={labels}
      />,
    );

    fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "results" } });
    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Higher results");
    expect(rows[2]).toHaveTextContent("Lower results");
  });

  it("allows columns to be hidden while keeping one metric visible", () => {
    render(
      <AdvertisingHierarchyExplorer
        campaigns={[{ ...metrics, campaignId: "campaign-1", adCount: 0, name: "Campaign 1" }]}
        adSets={[]}
        ads={[]}
        currency="EUR"
        locale="en"
        labels={labels}
      />,
    );

    fireEvent.click(screen.getByText("Columns"));
    const spendCheckbox = screen.getByRole("checkbox", { name: "Spend" });
    fireEvent.click(spendCheckbox);
    expect(screen.queryByRole("columnheader", { name: "Spend" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "CTR" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Delivery" }));
    expect(screen.getByRole("columnheader", { name: "Results" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "CTR" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Delivery" })).not.toBeInTheDocument();
  });
});
