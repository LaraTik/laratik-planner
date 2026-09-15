import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { ALL_STATUSES } from "@/lib/content/status";
import { WorkflowRail } from "@/components/planning/workflow-rail";

vi.mock("@/app/(app)/app/w/[slug]/planning/actions", () => ({
  transitionAction: vi.fn(),
  decideApprovalAction: vi.fn(),
  claimAction: vi.fn(),
  assignDesignerAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

/**
 * Regression guard for the canonical six-stage WorkflowRail.
 * Detailed backend statuses must always map to one visible
 * lifecycle milestone; blocked/cancelled remain conditions.
 */
describe("WorkflowRail pipeline ladder (React #441 regression guard)", () => {
  const baseRoles = {
    isManager: false,
    isPlanner: false,
    isDesigner: false,
    isInternalReviewer: false,
    isClientReviewer: false,
    isPublisher: false,
  };

  it("renders a primary current badge for active statuses and a condition for blocked/cancelled", () => {
    expect(ALL_STATUSES.length).toBeGreaterThan(0);

    for (const status of ALL_STATUSES) {
      const { container, unmount } = render(
        <WorkflowRail
          workspaceSlug="acme"
          contentItemId="ci-1"
          status={status}
          blockedReason={null}
          cancellationReason={null}
          roles={baseRoles}
          approvals={[]}
          designers={[]}
        />,
      );

      if (status === "blocked" || status === "cancelled") {
        expect(
          container.querySelector('[data-testid="workflow-rail-condition"]'),
        ).toBeInTheDocument();
        expect(container.querySelector('[data-stage="planning"]')).not.toBeInTheDocument();
        unmount();
        continue;
      }
      const currentMarker = container.querySelector('[data-state="current"]');
      expect(
        currentMarker,
        `expected a current six-stage marker when status=${status}`,
      ).toBeInTheDocument();
      unmount();
    }
  });

  it("keeps designer assignment visible while an item is already in design", () => {
    const { getByTestId } = render(
      <WorkflowRail
        workspaceSlug="acme"
        contentItemId="ci-1"
        status="in_design"
        blockedReason={null}
        cancellationReason={null}
        roles={{ ...baseRoles, isManager: true }}
        approvals={[]}
        designers={[{ id: "designer-1", label: "Designer Name" }]}
        designer={{ id: "designer-1", label: "Designer Name" }}
      />,
    );

    expect(getByTestId("workflow-designer-assignment")).toHaveTextContent("Designer Name");
    expect(getByTestId("assign-designer-trigger")).toHaveTextContent("Change designer");
  });

  it("keeps manager-only destructive actions collapsed by default", () => {
    const { container } = render(
      <WorkflowRail
        workspaceSlug="acme"
        contentItemId="ci-1"
        status="draft"
        blockedReason={null}
        cancellationReason={null}
        roles={{ ...baseRoles, isManager: true }}
        approvals={[]}
        designers={[]}
      />,
    );

    const disclosure = container.querySelector<HTMLElement>(
      '[data-testid="workflow-destructive-actions"]',
    );
    expect(disclosure).toBeInTheDocument();
    if (!disclosure) throw new Error("Destructive actions disclosure was not rendered");
    expect(disclosure).not.toHaveAttribute("open");
    fireEvent.click(disclosure.querySelector("summary")!);
    expect(disclosure).toHaveAttribute("open");
    expect(disclosure).toHaveTextContent("Cancel");
    expect(disclosure).toHaveTextContent("Block");
  });
});
