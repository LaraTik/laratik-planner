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
    ["draft", "planning", "1/4"],
    ["content_review", "planning", "1/4"],
    ["changes_requested", "planning", "1/4"],
    ["approved_for_design", "design", "3/4"],
    ["in_design", "design", "3/4"],
    ["creative_review", "design", "3/4"],
    ["ready_to_publish", "publish", "4/4"],
    ["partially_published", "publish", "4/4"],
    ["published", "publish", "4/4"],
  ] as const)("maps %s to the %s stage at position %s", (status, stage, position) => {
    render(<StagePill status={status as ContentStatus} />);
    const pill = screen.getByTestId("stage-pill");
    expect(pill).toHaveAttribute("data-stage", stage);
    expect(pill).toHaveTextContent(position);
  });

  it("lands blocked on the Review stage so the row never shows nothing", () => {
    render(<StagePill status="blocked" />);
    expect(screen.getByTestId("stage-pill")).toHaveAttribute("data-stage", "review");
  });

  it("lands cancelled on the Publish stage", () => {
    render(<StagePill status="cancelled" />);
    expect(screen.getByTestId("stage-pill")).toHaveAttribute("data-stage", "publish");
  });

  it("exposes a tooltip with the human-readable stage + position", () => {
    render(<StagePill status="in_design" />);
    const pill = screen.getByTestId("stage-pill");
    expect(pill).toHaveAttribute("title", "Current stage: Design (3 of 4)");
  });

  it("covers every content status without crashing", () => {
    // Pin the contract: every enum value in ALL_STATUSES renders a
    // valid pill. A future status added to the enum will surface
    // here, which is the prompt to add a mapping.
    for (const status of ALL_STATUSES) {
      const { unmount } = render(<StagePill status={status} />);
      const pill = screen.getByTestId("stage-pill");
      expect(pill).toHaveAttribute("data-status", status);
      expect(pill.getAttribute("data-stage")).toBeTruthy();
      unmount();
    }
  });
});
