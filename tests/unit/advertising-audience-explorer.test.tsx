import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdvertisingAudienceExplorer } from "@/app/(app)/app/a/[agencySlug]/w/[slug]/analytics/advertising/advertising-audience-explorer";

const labels = {
  title: "Audience intelligence",
  description: "Provider audience rows",
  empty: "No audience data",
  age: "Age",
  gender: "Gender",
  country: "Country",
  placement: "Placement",
  metric: "Rank by",
  spend: "Spend",
  impressions: "Impressions",
  reach: "Reach",
  clicks: "Clicks",
  shareOfSpend: "Share of spend",
  showAll: "Show all",
  showTop: "Show top 5",
  rows: "rows",
  noBreakdown: "No rows for this breakdown",
  limitations: "Provider limitations",
  attributionUnavailable: "Results unavailable for this breakdown",
  unavailable: "Not available",
  tableLabel: "Audience delivery",
} as const;

describe("AdvertisingAudienceExplorer", () => {
  it("defaults to the top five rows and lets the user disclose the rest", () => {
    render(
      <AdvertisingAudienceExplorer
        rows={Array.from({ length: 6 }, (_, index) => ({
          reportDate: "2026-10-01",
          breakdown: "age",
          dimensionValue: `${18 + index}-${24 + index}`,
          currency: "EUR",
          spend: String(10 + index),
          impressions: 100 + index,
          clicks: 4 + index,
          reach: 80 + index,
        }))}
        currency="EUR"
        locale="en"
        labels={labels}
      />,
    );

    const table = screen.getByRole("table", { name: labels.tableLabel });
    expect(within(table).getAllByRole("row")).toHaveLength(6);
    expect(screen.getByText("22-28")).toBeInTheDocument();
    expect(screen.queryByText("18-24")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: labels.showAll }));
    expect(screen.getByText("18-24")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: labels.showTop })).toBeInTheDocument();
  });

  it("keeps unsupported breakdown tabs disabled instead of inventing rows", () => {
    render(
      <AdvertisingAudienceExplorer
        rows={[
          {
            reportDate: "2026-10-01",
            breakdown: "country",
            dimensionValue: "DE",
            currency: "EUR",
            spend: "20",
            impressions: 200,
            clicks: null,
            reach: null,
          },
        ]}
        currency="EUR"
        locale="en"
        labels={labels}
      />,
    );

    expect(screen.getByRole("tab", { name: labels.country })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: labels.age })).toBeDisabled();
    expect(screen.getByText("DE")).toBeInTheDocument();
    expect(screen.getByText(labels.attributionUnavailable)).toBeInTheDocument();
  });

  it("aggregates repeated dimensions without summing unsafe reach", () => {
    render(
      <AdvertisingAudienceExplorer
        rows={[
          {
            reportDate: "2026-10-01",
            breakdown: "age",
            dimensionValue: "25-34",
            currency: "EUR",
            spend: "20",
            impressions: 100,
            clicks: 4,
            reach: 80,
          },
          {
            reportDate: "2026-10-02",
            breakdown: "age",
            dimensionValue: "25-34",
            currency: "EUR",
            spend: "30",
            impressions: 200,
            clicks: 6,
            reach: 90,
          },
        ]}
        currency="EUR"
        locale="en"
        labels={labels}
      />,
    );

    fireEvent.change(screen.getByLabelText(labels.metric), { target: { value: "reach" } });
    const table = screen.getByRole("table", { name: labels.tableLabel });
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(within(table).getByText(labels.unavailable)).toBeInTheDocument();
  });
});
