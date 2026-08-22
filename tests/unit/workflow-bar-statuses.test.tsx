import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ALL_STATUSES } from "@/lib/content/status";
import { WorkflowBar } from "@/app/(app)/app/w/[slug]/planning/[id]/workflow-bar";

vi.mock("@/app/(app)/app/w/[slug]/planning/actions", () => ({
  transitionAction: vi.fn(),
  decideApprovalAction: vi.fn(),
  claimAction: vi.fn(),
}));

/**
 * Regression guard for the WorkflowBar status ladder.
 *
 * The workflow bar renders a per-status badge row using an internal
 * STATUSES constant. If that constant is missing any branch state
 * (`changes_requested`, `blocked`, `cancelled`) the badge row renders
 * without a "current" marker for items in those states — the
 * `STATUSES.indexOf(status)` lookup returns -1, every `past` predicate
 * is false, and all badges collapse to the outline variant.
 *
 * That divergence between the data the server-rendered HTML implies
 * (no current badge) and the shape the client component expects to
 * re-render after `revalidatePath("/app/w/")` ran the workflow
 * transition is what surfaces in production builds as React error
 * #441 ("An error occurred in the Server Components render").
 *
 * This test asserts the WorkflowBar's STATUSES ladder contains every
 * canonical ContentStatus. If a future refactor trims it back, the
 * assert below fails before the change reaches CI.
 */
describe("WorkflowBar status ladder (React #441 regression guard)", () => {
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
        <WorkflowBar
          workspaceSlug="acme"
          contentItemId="ci-1"
          status={status}
          blockedReason={null}
          cancellationReason={null}
          roles={baseRoles}
          approvals={[]}
        />,
      );

      // `bg-primary-subtle` is the class the `primary` Badge variant
      // uses (per components/ui/badge.tsx). The current status's
      // badge should carry it; if the status is missing from the
      // ladder, no badge carries it and we fail.
      const primaryBadges = container.querySelectorAll(".bg-primary-subtle");
      expect(
        primaryBadges.length,
        `expected at least one primary badge when status=${status}`,
      ).toBeGreaterThanOrEqual(1);
      unmount();
    }
  });
});
