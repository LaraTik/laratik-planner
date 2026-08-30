import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlanCoverageCard } from "@/components/workspace/plan-coverage-card";

/**
 * ADR-0007 — PlanCoverageCard semantic contract.
 *
 * The pre-refactor card rendered "27 / — items · No target" as
 * passive metadata. The refactored card has four concrete jobs
 * (count, target/coverage, no-target CTA, format mix). These
 * tests pin the contract: when a target is set the card shows
 * progress; when no target is set the card shows an actionable
 * "Set target" callout; the format mix is a list of clickable
 * rows.
 */
describe("PlanCoverageCard", () => {
  const baseBreakdown = [
    { format: "story" as const, label: "Story", count: 13 },
    { format: "short_form_video" as const, label: "Reel", count: 10 },
    { format: "carousel" as const, label: "Carousel", count: 2 },
    { format: "static_post" as const, label: "Image", count: 1 },
    { format: "other" as const, label: "Other", count: 1 },
  ];

  it("renders the headline count and the format mix", () => {
    render(
      <PlanCoverageCard
        total={27}
        monthlyTarget={30}
        coveragePercent={90}
        formatBreakdown={baseBreakdown}
        buildFormatHref={(f) => `/app/w/acme/planning?format=${f}`}
        settingsHref="/app/w/acme/settings"
      />,
    );
    expect(screen.getByText("Plan coverage")).toBeInTheDocument();
    expect(screen.getByText("27")).toBeInTheDocument();
    // The "30 planned" copy is split across <span>s (target + label);
    // assert the accessible container exposes the right percent.
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "90");
    expect(screen.getByText(/90% coverage/)).toBeInTheDocument();
  });

  it("shows a no-target callout with a 'Set target' CTA when no target is set", () => {
    render(
      <PlanCoverageCard
        total={27}
        monthlyTarget={null}
        coveragePercent={null}
        formatBreakdown={baseBreakdown}
        buildFormatHref={(f) => `/app/w/acme/planning?format=${f}`}
        settingsHref="/app/w/acme/settings"
      />,
    );
    expect(screen.getByText(/no monthly target/i)).toBeInTheDocument();
    const cta = screen.getAllByRole("link", { name: /set target/i });
    expect(cta.length).toBeGreaterThan(0);
    expect(cta[0]).toHaveAttribute("href", "/app/w/acme/settings");
  });

  it("shows 'Target met' when coverage is at or above the target", () => {
    render(
      <PlanCoverageCard
        total={30}
        monthlyTarget={30}
        coveragePercent={100}
        formatBreakdown={baseBreakdown}
        buildFormatHref={(f) => `/app/w/acme/planning?format=${f}`}
        settingsHref="/app/w/acme/settings"
      />,
    );
    expect(screen.getByText(/target met/i)).toBeInTheDocument();
  });

  it("shows remaining count when below target", () => {
    render(
      <PlanCoverageCard
        total={27}
        monthlyTarget={30}
        coveragePercent={90}
        formatBreakdown={baseBreakdown}
        buildFormatHref={(f) => `/app/w/acme/planning?format=${f}`}
        settingsHref="/app/w/acme/settings"
      />,
    );
    expect(screen.getByText(/3 items? to go/i)).toBeInTheDocument();
  });

  it("renders the format mix as clickable rows with the planning-list href", () => {
    render(
      <PlanCoverageCard
        total={27}
        monthlyTarget={30}
        coveragePercent={90}
        formatBreakdown={baseBreakdown}
        buildFormatHref={(f) => `/app/w/acme/planning?format=${f}`}
        settingsHref="/app/w/acme/settings"
      />,
    );
    const storyRow = screen.getByRole("link", { name: /Story: 13 items/ });
    expect(storyRow).toHaveAttribute("href", "/app/w/acme/planning?format=story");
    const reelRow = screen.getByRole("link", { name: /Reel: 10 items/ });
    expect(reelRow).toHaveAttribute("href", "/app/w/acme/planning?format=short_form_video");
  });

  it("shows the empty state when the workspace has no items", () => {
    render(
      <PlanCoverageCard
        total={0}
        monthlyTarget={30}
        coveragePercent={0}
        formatBreakdown={baseBreakdown.map((b) => ({ ...b, count: 0 }))}
        buildFormatHref={(f) => `/app/w/acme/planning?format=${f}`}
        settingsHref="/app/w/acme/settings"
      />,
    );
    expect(screen.getByText(/no items this month/i)).toBeInTheDocument();
  });
});
