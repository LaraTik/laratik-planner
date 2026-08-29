import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkflowProgress } from "@/components/planning/workflow-progress";

const ROLES = {
  isManager: true,
  isPlanner: false,
  isDesigner: false,
  isInternalReviewer: false,
  isClientReviewer: false,
  isPublisher: false,
};

describe("WorkflowProgress", () => {
  it("renders the current step label and a compact stepper", () => {
    render(<WorkflowProgress status="draft" roles={ROLES} />);
    expect(screen.getByText("Idea drafted")).toBeInTheDocument();
    // The compact stepper renders every step as a pill.
    expect(screen.getByTestId("workflow-progress-stepper")).toBeInTheDocument();
  });

  it("shows 'You can act on this' when the actor holds a required role", () => {
    render(<WorkflowProgress status="draft" roles={ROLES} />);
    expect(screen.getByText("You can act on this")).toBeInTheDocument();
  });

  it("shows 'Awaiting another role' when the actor holds no required role", () => {
    render(
      <WorkflowProgress
        status="content_review"
        roles={{
          ...ROLES,
          isManager: false,
          isInternalReviewer: false,
        }}
      />,
    );
    expect(screen.getByText("Awaiting another role")).toBeInTheDocument();
  });

  it("renders the blocked reason when status is blocked", () => {
    render(
      <WorkflowProgress status="blocked" roles={ROLES} blockedReason="Awaiting copy approval" />,
    );
    expect(screen.getByTestId("workflow-blocked-reason")).toHaveTextContent(
      "Awaiting copy approval",
    );
  });

  it("renders the cancelled reason when status is cancelled", () => {
    render(
      <WorkflowProgress
        status="cancelled"
        roles={ROLES}
        cancellationReason="Replaced by spring campaign"
      />,
    );
    expect(screen.getByTestId("workflow-cancelled-reason")).toHaveTextContent(
      "Replaced by spring campaign",
    );
  });

  it("expands the full ladder when 'Show all steps' is clicked", async () => {
    render(<WorkflowProgress status="in_design" roles={ROLES} />);
    const toggle = screen.getByTestId("workflow-progress-toggle");
    expect(toggle).toHaveTextContent(/Show all steps/i);
    await userEvent.click(toggle);
    const detail = screen.getByTestId("workflow-progress-detail");
    expect(detail).toBeInTheDocument();
    // The full ladder lists every step.
    const items = within(detail).getAllByRole("listitem");
    expect(items.length).toBeGreaterThanOrEqual(8);
  });
});
