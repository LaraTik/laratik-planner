import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormatDistributionBars } from "@/components/workspace/format-distribution-bars";

/**
 * The format-mix visualization on Plan Coverage. Replaces the
 * pre-refactor "tiny text dots" legend with a horizontal bar
 * chart. Each row is a link to the planning list filtered by
 * the matching format.
 */
describe("FormatDistributionBars", () => {
  const bars = [
    { format: "story" as const, label: "Story", count: 13 },
    { format: "short_form_video" as const, label: "Reel", count: 10 },
    { format: "carousel" as const, label: "Carousel", count: 2 },
    { format: "static_post" as const, label: "Image", count: 1 },
    { format: "other" as const, label: "Other", count: 1 },
  ];

  it("renders one row per non-zero format with the count and share", () => {
    render(
      <FormatDistributionBars bars={bars} buildHref={(f) => `/app/w/acme/planning?format=${f}`} />,
    );
    // 13/27 = 48%
    expect(screen.getByText("13")).toBeInTheDocument();
    expect(screen.getByText(/48%/)).toBeInTheDocument();
  });

  it("links each row to the matching planning-list href", () => {
    render(
      <FormatDistributionBars bars={bars} buildHref={(f) => `/app/w/acme/planning?format=${f}`} />,
    );
    const link = screen.getByRole("link", { name: /Story: 13 items/ });
    expect(link).toHaveAttribute("href", "/app/w/acme/planning?format=story");
  });

  it("hides zero-count formats", () => {
    render(
      <FormatDistributionBars
        bars={[
          { format: "story" as const, label: "Story", count: 5 },
          { format: "carousel" as const, label: "Carousel", count: 0 },
        ]}
        buildHref={(f) => `/app/w/acme/planning?format=${f}`}
      />,
    );
    expect(screen.getByRole("link", { name: /Story/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Carousel/i })).toBeNull();
  });

  it("shows the empty state when there are no items", () => {
    render(
      <FormatDistributionBars bars={[]} buildHref={(f) => `/app/w/acme/planning?format=${f}`} />,
    );
    expect(screen.getByText(/no items this month/i)).toBeInTheDocument();
  });
});
