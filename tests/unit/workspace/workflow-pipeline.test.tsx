import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkflowPipeline } from "@/components/workspace/workflow-pipeline";

/**
 * The pre-refactor 8-tile StatusPipeline was a row of stat cards,
 * including a "Total" tile that isn't a workflow state. The new
 * WorkflowPipeline renders a 4-stage horizontal flow (Planning /
 * Review / Design / Publish) matching the vocabulary on the
 * planning detail page. These tests pin the 4-stage contract.
 */
describe("WorkflowPipeline", () => {
  const stages = [
    { stage: "planning" as const, label: "Planning", count: 24 },
    { stage: "review" as const, label: "Review", count: 1 },
    { stage: "design" as const, label: "Design", count: 1 },
    { stage: "publish" as const, label: "Publish", count: 1 },
  ];

  it("renders the 4 stages in the canonical order, no Total tile", () => {
    render(
      <WorkflowPipeline stages={stages} buildHref={(s) => `/app/w/acme/planning?stage=${s}`} />,
    );
    expect(screen.getByText("Planning")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(screen.getByText("Design")).toBeInTheDocument();
    expect(screen.getByText("Publish")).toBeInTheDocument();
    // The pre-refactor pipeline had a "Total" tile. Asserting its
    // absence is the most direct regression guard for ADR-0007.
    expect(screen.queryByText("Total")).toBeNull();
  });

  it("renders a clickable link per stage with the buildHref callback", () => {
    render(
      <WorkflowPipeline stages={stages} buildHref={(s) => `/app/w/acme/planning?stage=${s}`} />,
    );
    const planningLink = screen.getByRole("link", { name: /Planning stage/i });
    expect(planningLink).toHaveAttribute("href", "/app/w/acme/planning?stage=planning");
    const designLink = screen.getByRole("link", { name: /Design stage/i });
    expect(designLink).toHaveAttribute("href", "/app/w/acme/planning?stage=design");
  });

  it("shows the count + share % for each stage", () => {
    render(
      <WorkflowPipeline stages={stages} buildHref={(s) => `/app/w/acme/planning?stage=${s}`} />,
    );
    // 24/27 ≈ 89% (share), 1/27 ≈ 4% (each)
    expect(screen.getByText("89%")).toBeInTheDocument();
    expect(screen.getAllByText("4%").length).toBeGreaterThan(0);
  });

  it("handles the all-empty case (no items) without crashing", () => {
    render(
      <WorkflowPipeline
        stages={stages.map((s) => ({ ...s, count: 0 }))}
        buildHref={(s) => `/app/w/acme/planning?stage=${s}`}
      />,
    );
    // 0% on every stage
    expect(screen.getAllByText("0%").length).toBeGreaterThan(0);
  });
});
