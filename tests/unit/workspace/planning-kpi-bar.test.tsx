import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlanningKpiBar } from "@/components/workspace/planning-kpi-bar";

// PlanningKpiBar renders <a> links with hrefs; no client hooks. No
// next/navigation mock needed.

describe("PlanningKpiBar", () => {
  it("renders 5 tiles with the given counts", () => {
    render(
      <PlanningKpiBar
        total={18}
        atRisk={3}
        needsReview={2}
        ready={5}
        notStarted={4}
        baseHref="/app/w/acme/planning"
        currentQuery={new URLSearchParams("month=2026-08")}
      />,
    );
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Total Planned")).toBeInTheDocument();
    expect(screen.getByText("At Risk")).toBeInTheDocument();
    expect(screen.getByText("Needs Review")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("Not started")).toBeInTheDocument();
  });

  it("links the At Risk tile with risk=at_risk and the Ready tile with status=ready_to_publish", () => {
    render(
      <PlanningKpiBar
        total={18}
        atRisk={3}
        needsReview={2}
        ready={5}
        notStarted={4}
        baseHref="/app/w/acme/planning"
        currentQuery={new URLSearchParams("month=2026-08")}
      />,
    );
    const atRiskLink = screen.getByTestId("planning-kpi-at-risk");
    expect(atRiskLink).toHaveAttribute("href", "/app/w/acme/planning?month=2026-08&risk=at_risk");
    const readyLink = screen.getByTestId("planning-kpi-ready");
    expect(readyLink).toHaveAttribute(
      "href",
      "/app/w/acme/planning?month=2026-08&status=ready_to_publish",
    );
    const notStartedLink = screen.getByTestId("planning-kpi-not-started");
    expect(notStartedLink).toHaveAttribute(
      "href",
      "/app/w/acme/planning?month=2026-08&status=draft",
    );
  });

  it("preserves unrelated query params on the tile links", () => {
    render(
      <PlanningKpiBar
        total={18}
        atRisk={3}
        needsReview={2}
        ready={5}
        notStarted={4}
        baseHref="/app/w/acme/planning"
        currentQuery={new URLSearchParams("month=2026-08&density=compact")}
      />,
    );
    const atRiskLink = screen.getByTestId("planning-kpi-at-risk");
    expect(atRiskLink.getAttribute("href")).toContain("density=compact");
    expect(atRiskLink.getAttribute("href")).toContain("risk=at_risk");
  });

  it("strips the risk param on the Total Planned tile (it's the unfiltered view)", () => {
    render(
      <PlanningKpiBar
        total={18}
        atRisk={3}
        needsReview={2}
        ready={5}
        notStarted={4}
        baseHref="/app/w/acme/planning"
        currentQuery={new URLSearchParams("month=2026-08&risk=at_risk")}
      />,
    );
    const totalLink = screen.getByTestId("planning-kpi-total");
    expect(totalLink.getAttribute("href")).not.toContain("risk=at_risk");
  });
});
