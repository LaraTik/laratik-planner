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

/**
 * Month-phase wording.
 *
 * The counts never change with the phase — for a closed month every item
 * already satisfies `plannedPublishAt < now`, so re-anchoring the arithmetic
 * would be a no-op. What has to change is whether the number is presented as
 * something to act on:
 *
 *   future — "100% on track" is vacuous (nothing can be late in a month that
 *            has not started), so the percentage is suppressed outright.
 *   past   — "At risk" implies "fix this", but a closed month is a record, so
 *            the bucket is relabelled "Missed" and marked non-actionable.
 */
describe("DeliveryHealthCard — month phase", () => {
  const baseProps = {
    total: 8,
    onTrackCount: 5,
    onTrackPercent: 63,
    atRiskCount: 3,
    atRiskPercent: 37,
    blockedCount: 0,
    blockedPercent: 0,
    riskReasons: [
      { label: "Past planned date", count: 3, href: "/app/w/acme/planning?risk=at_risk" },
    ],
    atRiskHref: "/app/w/acme/planning?risk=at_risk",
    onTrackHref: "/app/w/acme/planning",
    blockedHref: "/app/w/acme/planning?status=blocked",
    viewAllHref: "/app/w/acme/planning?risk=at_risk",
  };

  it("defaults to the current month and keeps the 'At risk' label", () => {
    render(<DeliveryHealthCard {...baseProps} />);
    expect(screen.getByText("At risk")).toBeInTheDocument();
    expect(screen.queryByText("Missed")).toBeNull();
    expect(screen.queryByTestId("delivery-health-closed-month-note")).toBeNull();
    expect(screen.getByText("63%")).toBeInTheDocument();
  });

  it("suppresses the headline percentage for a future month", () => {
    render(<DeliveryHealthCard {...baseProps} monthPhase="future" />);
    // The percentage must NOT render — it would always read 100% for a month
    // that has not started, which is a claim rather than a measurement.
    expect(screen.queryByText("63%")).toBeNull();
    expect(screen.queryByLabelText(/63 percent on track/i)).toBeNull();
    expect(screen.getByText(/nothing is late yet/i)).toBeInTheDocument();
  });

  it("uses a future-specific eyebrow rather than the actionable one", () => {
    render(<DeliveryHealthCard {...baseProps} monthPhase="future" />);
    expect(screen.getByText("Nothing is late yet")).toBeInTheDocument();
    expect(screen.queryByText("Are items on track to ship")).toBeNull();
  });

  it("keeps the per-bucket counts visible for a future month", () => {
    render(<DeliveryHealthCard {...baseProps} monthPhase="future" />);
    // Suppressing the headline must not hide the underlying numbers.
    expect(screen.getByRole("link", { name: /^On track: 5 items/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/On track 5 of 8/)).toBeInTheDocument();
  });

  it("relabels At risk as Missed for a closed month", () => {
    render(<DeliveryHealthCard {...baseProps} monthPhase="past" />);
    expect(screen.getByText("Missed")).toBeInTheDocument();
    expect(screen.queryByText("At risk")).toBeNull();
  });

  it("marks a closed month as a record rather than a to-do list", () => {
    render(<DeliveryHealthCard {...baseProps} monthPhase="past" />);
    expect(screen.getByTestId("delivery-health-closed-month-note")).toHaveTextContent(
      /record, not a to-do list/i,
    );
  });

  it("still shows the headline percentage for a closed month — the count is real", () => {
    render(<DeliveryHealthCard {...baseProps} monthPhase="past" />);
    expect(screen.getByText("63%")).toBeInTheDocument();
  });

  it("uses a closed-month eyebrow for a past month", () => {
    render(<DeliveryHealthCard {...baseProps} monthPhase="past" />);
    expect(screen.getByText("What shipped, and what was missed")).toBeInTheDocument();
  });
});

/**
 * ADR-0006 parity in the UI.
 *
 * Drafts are excluded from the at-risk count, so the stacked bar grew a
 * fourth "Not started" segment. Without it, excluding drafts from at-risk
 * would silently drop a third of a typical month off the chart — the bar would
 * no longer reconcile with the total, and slipped drafts would be invisible
 * rather than merely reclassified.
 */
describe("DeliveryHealthCard — not-started bucket", () => {
  const baseProps = {
    total: 27,
    onTrackCount: 1,
    onTrackPercent: 4,
    atRiskCount: 0,
    atRiskPercent: 0,
    blockedCount: 0,
    blockedPercent: 0,
    riskReasons: [],
    atRiskHref: "/app/w/acme/planning?risk=at_risk",
    onTrackHref: "/app/w/acme/planning",
    blockedHref: "/app/w/acme/planning?status=blocked",
    viewAllHref: "/app/w/acme/planning?risk=at_risk",
  };

  it("renders a Not started tile with its own drill-down", () => {
    render(
      <DeliveryHealthCard
        {...baseProps}
        notStartedCount={26}
        notStartedPercent={96}
        notStartedHref="/app/w/acme/planning?status=draft"
      />,
    );
    const link = screen.getByRole("link", { name: /^Not started: 26 items/i });
    expect(link).toHaveAttribute("href", "/app/w/acme/planning?status=draft");
  });

  it("includes not-started in the stacked bar's accessible summary", () => {
    render(<DeliveryHealthCard {...baseProps} notStartedCount={26} notStartedPercent={96} />);
    expect(
      screen.getByLabelText(/On track 1 of 27, at risk 0, blocked 0, not started 26/),
    ).toBeInTheDocument();
  });

  it("defaults to zero so an older caller cannot break the bar", () => {
    render(<DeliveryHealthCard {...baseProps} />);
    expect(screen.getByRole("link", { name: /^Not started: 0 items/i })).toBeInTheDocument();
    // The default href falls back to onTrackHref rather than rendering a dead link.
    expect(screen.getByRole("link", { name: /^Not started: 0 items/i })).toHaveAttribute(
      "href",
      "/app/w/acme/planning",
    );
  });
});
