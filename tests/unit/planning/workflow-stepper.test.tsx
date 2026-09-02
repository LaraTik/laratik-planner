/**
 * Regression test for the compact workflow stepper.
 *
 * The previous design rendered the entire 11-status state
 * machine as a pipeline of pills on the workflow bar. That
 * exposed the state machine to the user instead of the
 * conceptual "Draft → Review → Design → Publish" stages. The
 * new stepper maps every status to one of the four stages
 * with a non-linear state as a separate "Current" pill.
 *
 * The mapping must:
 *   1. Cover every `ContentStatus` (the test feeds every
 *      status from the canonical enum).
 *   2. Always report a known `stage` and a non-empty
 *      `detailed` label.
 *   3. Mark non-linear states (`changes_requested`,
 *      `blocked`, `cancelled`, `partially_published`) with
 *      the matching `variant` so the UI can render a special
 *      chip instead of an active step pill.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import {
  stageForStatus,
  WorkflowStepper,
  type WorkflowStage,
} from "@/components/planning/workflow-stepper";
import { ALL_STATUSES } from "@/lib/content/status";

describe("WorkflowStepper — status → stage mapping", () => {
  it("covers every ContentStatus", () => {
    const stages: WorkflowStage[] = ["draft", "review", "design", "publish"];
    for (const status of ALL_STATUSES) {
      const { stage, detailed, variant } = stageForStatus(status);
      expect(stages, `stage for ${status}`).toContain(stage);
      expect(detailed.length, `detailed for ${status}`).toBeGreaterThan(0);
      expect(["linear", "changes_requested", "blocked", "cancelled", "partially"]).toContain(
        variant,
      );
    }
  });

  it("treats `changes_requested` as a special state (not a stage step)", () => {
    const out = stageForStatus("changes_requested");
    expect(out.variant).toBe("changes_requested");
    expect(out.stage).toBe("review");
  });

  it("treats `blocked` and `cancelled` as special states", () => {
    expect(stageForStatus("blocked").variant).toBe("blocked");
    expect(stageForStatus("cancelled").variant).toBe("cancelled");
  });

  it("treats `partially_published` as a special state at the publish stage", () => {
    const out = stageForStatus("partially_published");
    expect(out.variant).toBe("partially");
    expect(out.stage).toBe("publish");
  });
});

describe("WorkflowStepper — render", () => {
  it("renders a 4-stage rail in `full` mode", () => {
    render(<WorkflowStepper status="draft" size="full" />);
    const rail = screen.getByTestId("workflow-stepper-rail");
    expect(rail).toBeInTheDocument();
    for (const stage of ["draft", "review", "design", "publish"]) {
      expect(rail.querySelector(`[data-stage-id="${stage}"]`)).toBeInTheDocument();
    }
  });

  it("shows the detailed state as a special chip when variant is non-linear", () => {
    render(<WorkflowStepper status="blocked" size="full" />);
    const special = screen.getByTestId("workflow-stepper-special-state");
    expect(special).toBeInTheDocument();
    expect(special.getAttribute("data-variant")).toBe("blocked");
    expect(special.textContent).toContain("Blocked");
  });

  it("renders compact size", () => {
    render(<WorkflowStepper status="content_review" size="compact" />);
    expect(screen.getByTestId("workflow-stepper-compact")).toBeInTheDocument();
  });

  it("renders stage and status labels from the active Arabic catalog", () => {
    render(
      <LocaleProvider locale="ar">
        <WorkflowStepper status="changes_requested" size="full" />
      </LocaleProvider>,
    );

    expect(screen.getByText("التخطيط")).toBeInTheDocument();
    expect(screen.getByText("مراجعة المحتوى")).toBeInTheDocument();
    expect(screen.getByText("التعديلات المطلوبة")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-stepper-rail")).toHaveAttribute(
      "aria-label",
      "مراحل سير العمل",
    );
  });
});
