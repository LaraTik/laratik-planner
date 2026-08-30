import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ALL_STATUSES } from "@/lib/content/status";
import { WorkflowRail } from "@/components/planning/workflow-rail";

vi.mock("@/app/(app)/app/w/[slug]/planning/actions", () => ({
  transitionAction: vi.fn(),
  decideApprovalAction: vi.fn(),
  claimAction: vi.fn(),
}));

/**
 * Regression guard for the WorkflowRail's "View workflow" disclosure.
 *
 * The rail renders an 11-step pipeline behind a `<details>`
 * toggle. Each step's badge uses a per-status variant — the
 * current step uses `primary`, past steps use `success`, and
 * future steps use `outline`. The `STATUSES.indexOf(status)`
 * lookup is the gate: if a status is missing from the ladder
 * the lookup returns -1, every `past` predicate is false, and
 * every badge collapses to `outline`. The current-step badge
 * disappears, the page renders without a "current" marker for
 * items in those states, and React #441 fires on the
 * post-`revalidatePath("/app/w/")` re-render because the server
 * HTML and the client re-render diverge.
 *
 * Phase 5 of the planning-detail refactor (2026-08-30) moved
 * the disclosure from the legacy `WorkflowBar` into the new
 * `WorkflowRail`. This test now guards the rail's STATUSES
 * ladder against the same defect class.
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

  it("renders a primary 'current' badge for every canonical ContentStatus", () => {
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

      // `bg-primary-subtle` is the class the `primary` Badge
      // variant uses (per components/ui/badge.tsx). The
      // current status's badge should carry it; if the
      // status is missing from the ladder, no badge
      // carries it and we fail.
      const primaryBadges = container.querySelectorAll(".bg-primary-subtle");
      expect(
        primaryBadges.length,
        `expected at least one primary badge when status=${status}`,
      ).toBeGreaterThanOrEqual(1);
      unmount();
    }
  });
});
