import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StagePill } from "@/components/workspace/stage-pill";
import { ALL_STATUSES, type ContentStatus } from "@/lib/content/status";

/**
 * StagePill — the inline "current stage" indicator in the planning
 * list row. The full stepper is intentionally NOT here; it lives
 * in the detail page. See AGENTS.md §B (progressive disclosure) +
 * §C (one concept = one visual language).
 *
 * These tests pin the status → stage mapping. A regression that
 * re-introduces a noisy stepper, or that drops a status into the
 * wrong stage bucket, fails the contract.
 */

describe("StagePill", () => {
  it.each([
    ["draft", "planning", "1/6"],
    ["changes_requested", "content_review", "2/6"],
    ["approved_for_design", "creative_production", "3/6"],
    ["in_design", "creative_production", "3/6"],
    ["creative_review", "creative_approval", "4/6"],
    ["ready_to_publish", "publishing_setup", "5/6"],
    ["partially_published", "publishing_setup", "5/6"],
    ["published", "published", "6/6"],
  ] as const)("maps %s to the %s stage at position %s", (status, stage, position) => {
    render(<StagePill status={status as ContentStatus} />);
    const pill = screen.getByTestId("stage-pill");
    expect(pill).toHaveAttribute("data-stage", stage);
    expect(pill).toHaveTextContent(position);
  });

  it("keeps blocked as a condition without claiming a lifecycle stage", () => {
    render(<StagePill status="blocked" />);
    const pill = screen.getByTestId("stage-pill");
    expect(pill).not.toHaveAttribute("data-stage");
    expect(pill).toHaveAttribute("data-condition", "blocked");
    expect(pill).toHaveTextContent(/Blocked/);
  });

  it("keeps cancelled as a condition without claiming a lifecycle stage", () => {
    render(<StagePill status="cancelled" />);
    const pill = screen.getByTestId("stage-pill");
    expect(pill).not.toHaveAttribute("data-stage");
    expect(pill).toHaveAttribute("data-condition", "cancelled");
    expect(pill).toHaveTextContent(/Cancelled/);
  });

  it("exposes a tooltip with the human-readable stage + position", () => {
    render(<StagePill status="in_design" />);
    const pill = screen.getByTestId("stage-pill");
    expect(pill).toHaveAttribute("title", "Current stage: Creative production (3 of 6)");
  });

  it("covers every content status without crashing", () => {
    // Pin the contract: every enum value in ALL_STATUSES renders a
    // valid pill. A future status added to the enum will surface
    // here, which is the prompt to add a mapping.
    for (const status of ALL_STATUSES) {
      const { unmount } = render(<StagePill status={status} />);
      const pill = screen.getByTestId("stage-pill");
      expect(pill).toHaveAttribute("data-status", status);
      if (status === "blocked" || status === "cancelled") {
        expect(pill).not.toHaveAttribute("data-stage");
      } else {
        expect(pill.getAttribute("data-stage")).toBeTruthy();
      }
      unmount();
    }
  });
});
