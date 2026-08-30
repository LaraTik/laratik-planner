import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DeliveryHealthCard } from "@/components/workspace/delivery-health-card";

/**
 * ADR-0007 — DeliveryHealthCard math consistency.
 *
 * The pre-refactor card labelled the donut "4% AT RISK" while
 * the at-risk count was 23 of 27. The refactored card renders
 * a stacked horizontal bar with three mutually-exclusive
 * segments (on-track / at-risk / blocked) and a single headline
 * number (the on-track percent). The three counts AND the
 * three percentages must agree, and the headline number must
 * never be "X% at risk" when atRiskCount is 0.
 */
describe("DeliveryHealthCard", () => {
  const baseProps = {
    total: 27,
    onTrackCount: 4,
    onTrackPercent: 15,
    atRiskCount: 23,
    atRiskPercent: 85,
    blockedCount: 0,
    blockedPercent: 0,
    riskReasons: [
      { label: "Past planned date", count: 12, href: "/app/w/acme/planning?risk=at_risk" },
      { label: "Missing design", count: 7, href: "/app/w/acme/planning?status=in_design" },
    ],
    atRiskHref: "/app/w/acme/planning?risk=at_risk",
    onTrackHref: "/app/w/acme/planning",
    blockedHref: "/app/w/acme/planning?status=blocked",
    viewAllHref: "/app/w/acme/planning?risk=at_risk",
  };

  it("renders a stacked health bar with the three segments", () => {
    render(<DeliveryHealthCard {...baseProps} />);
    expect(screen.getByLabelText(/On track 4 of 27/)).toBeInTheDocument();
    expect(screen.getByLabelText(/at risk 23/)).toBeInTheDocument();
  });

  it("renders the on-track percent as the headline number (NOT 'X% at risk')", () => {
    render(<DeliveryHealthCard {...baseProps} />);
    // The headline is the on-track % (15%), not the at-risk %.
    expect(screen.getByText("15%")).toBeInTheDocument();
    expect(screen.getByLabelText(/15 percent on track/)).toBeInTheDocument();
  });

  it("renders the at-risk count next to the At risk bucket label, drill-down link", () => {
    render(<DeliveryHealthCard {...baseProps} />);
    const atRiskLink = screen.getByRole("link", { name: /^At risk: 23 items/i });
    expect(atRiskLink).toHaveAttribute("href", "/app/w/acme/planning?risk=at_risk");
  });

  it("renders the risk-reason breakdown when at-risk count > 0", () => {
    render(<DeliveryHealthCard {...baseProps} />);
    expect(screen.getByText("Past planned date")).toBeInTheDocument();
    expect(screen.getByText("Missing design")).toBeInTheDocument();
  });

  it("hides the risk-reason breakdown when at-risk count is 0", () => {
    render(
      <DeliveryHealthCard
        {...baseProps}
        onTrackCount={27}
        onTrackPercent={100}
        atRiskCount={0}
        atRiskPercent={0}
      />,
    );
    expect(screen.queryByText("Why at risk")).toBeNull();
  });

  it("emits zero counts and 0% when the workspace is empty (no division by zero)", () => {
    render(
      <DeliveryHealthCard
        {...baseProps}
        total={0}
        onTrackCount={0}
        onTrackPercent={0}
        atRiskCount={0}
        atRiskPercent={0}
        blockedCount={0}
        blockedPercent={0}
        riskReasons={[]}
      />,
    );
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("tints the headline number when at-risk dominates (>50%)", () => {
    render(<DeliveryHealthCard {...baseProps} />);
    // The "15%" headline should pick up the warning class. We
    // assert the className substring rather than colour, which
    // is theme-token-based and would be brittle to test by RGB.
    const headline = screen.getByText("15%");
    expect(headline.className).toContain("text-warning");
  });
});
