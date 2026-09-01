import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { tFor } from "@/messages";

const t = tFor("en");

// All four components import server actions; mock them so the test
// stays pure structural (no Next.js server runtime needed).
vi.mock("@/app/(app)/app/w/[slug]/planning/actions", () => ({
  transitionAction: vi.fn(),
  decideApprovalAction: vi.fn(),
  claimAction: vi.fn(),
  submitDeliveryAction: vi.fn(),
  recordPublicationAction: vi.fn(),
  createCommentAction: vi.fn(),
}));

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return { ...actual, useFormStatus: vi.fn(() => ({ pending: false })) };
});

import { WorkflowRail } from "@/components/planning/workflow-rail";
import { DeliverySection } from "@/app/(app)/app/w/[slug]/planning/[id]/delivery-section";
import { ChannelPublishingCard } from "@/components/planning/channel-publishing-card";
import { CommentForm } from "@/components/comments/comment-form";

/**
 * Structural guard for the four client components used on the planning
 * detail page. Each component declares its hooks at the top of the
 * function body. If a future refactor moves a hook below an early
 * `return` (or behind a conditional), React's hook validator fires
 * error #441 — "Rendered more hooks than during the previous render".
 *
 * The guard renders the SAME component instance with two prop states
 * that would have triggered different early-return paths. If React's
 * validator fires (either via console.error or by throwing on
 * rerender), the test fails. This catches the actual production
 * failure mode: same component, props change, hook count drifts.
 */

const HOOKS_ORDER_PATTERNS = [
  /Rendered (?:more|fewer) hooks than during the previous render/i,
  /change in the order of Hooks called by/i,
  /cannot have a different number of hooks/i,
];

function captureConsoleError() {
  const messages: string[] = [];
  const original = console.error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  console.error = (...args: any[]) => {
    messages.push(args.map(String).join(" "));
  };
  return {
    messages,
    restore: () => {
      console.error = original;
    },
    assertNoHooksOrderError: () => {
      const offenders = messages.filter((m) => HOOKS_ORDER_PATTERNS.some((re) => re.test(m)));
      expect(offenders, offenders.join("\n")).toEqual([]);
    },
  };
}

function runWithoutThrowing(render: () => void): unknown {
  try {
    render();
    return null;
  } catch (e) {
    return e;
  }
}

describe("planning detail components — hooks order guard", () => {
  it("WorkflowRail: same instance, role/approval state transitions keep hook count stable", () => {
    // Phase 5 of the planning-detail refactor (2026-08-30)
    // moved the action buttons + approval timeline from
    // the legacy `WorkflowBar` (which is no longer rendered)
    // into the new `WorkflowRail`. The hook ordering risk
    // is the same: action branches via early-return in
    // `currentEligibleRoles.some(...)` + `hasAnyButton`
    // could move hooks below a conditional.
    const cap = captureConsoleError();
    try {
      const { rerender } = render(
        <WorkflowRail
          workspaceSlug="acme"
          contentItemId="ci-1"
          status="draft"
          blockedReason={null}
          cancellationReason={null}
          roles={{
            isManager: false,
            isPlanner: false,
            isDesigner: false,
            isInternalReviewer: false,
            isClientReviewer: false,
            isPublisher: false,
          }}
          approvals={[]}
          designers={[]}
        />,
      );
      // Same instance, different prop state — moves the
      // current stage from "draft" to "content_review",
      // which flips the eligible-roles branch and the
      // action-button block.
      const err = runWithoutThrowing(() =>
        rerender(
          <WorkflowRail
            workspaceSlug="acme"
            contentItemId="ci-1"
            status="content_review"
            blockedReason={null}
            cancellationReason={null}
            roles={{
              isManager: true,
              isPlanner: true,
              isDesigner: false,
              isInternalReviewer: true,
              isClientReviewer: false,
              isPublisher: false,
            }}
            approvals={[
              {
                id: "ap-1",
                gate: "content",
                status: "pending",
                requestedAt: new Date().toISOString(),
                deliveryVersionId: null,
              },
            ]}
            designers={[]}
          />,
        ),
      );
      cap.assertNoHooksOrderError();
      expect(err, err ? String(err) : "rerender threw").toBeNull();
    } finally {
      cap.restore();
    }
  });

  it("DeliverySection: same instance, canSubmit/open transitions keep hook count stable", () => {
    const cap = captureConsoleError();
    try {
      // State A: cannot submit, not open (would early-return null)
      const { rerender } = render(
        <DeliverySection
          workspaceSlug="acme"
          contentItemId="ci-1"
          contentStatus="draft"
          isDesigner={false}
          isManager={false}
          deliveries={[]}
        />,
      );
      // State B: can submit, opens form. Same instance.
      const err = runWithoutThrowing(() =>
        rerender(
          <DeliverySection
            workspaceSlug="acme"
            contentItemId="ci-1"
            contentStatus="in_design"
            isDesigner
            isManager
            deliveries={[]}
          />,
        ),
      );
      cap.assertNoHooksOrderError();
      expect(err, err ? String(err) : "rerender threw").toBeNull();
    } finally {
      cap.restore();
    }
  });

  it("ChannelPublishingCard: same instance, form open/close cycle keeps hook count stable", () => {
    // The per-channel card toggles between view (no form) and
    // edit (form mounted) on click. Hooks must stay in the same
    // order across that toggle so React's #441 validator doesn't
    // fire on the post-action re-render.
    const cap = captureConsoleError();
    try {
      const baseProps = {
        workspaceSlug: "acme",
        channel: {
          id: "cic-1",
          platform: "instagram",
          accountName: "@acme",
          configured: true,
        },
        publication: null,
        isPublisher: true,
      };
      const { rerender, getByTestId } = render(<ChannelPublishingCard {...baseProps} />);
      // State A: no publication — "Record outcome" button visible.
      expect(getByTestId("channel-card-record-outcome")).toBeInTheDocument();
      // State B: publication exists — "Update outcome" button visible.
      const err = runWithoutThrowing(() =>
        rerender(
          <ChannelPublishingCard
            {...baseProps}
            publication={{
              status: "published" as const,
              publishedUrl: "https://example.com/post/1",
              note: null,
              failureReason: null,
            }}
          />,
        ),
      );
      cap.assertNoHooksOrderError();
      expect(err, err ? String(err) : "rerender threw").toBeNull();
    } finally {
      cap.restore();
    }
  });

  it("CommentForm: same instance, visibility/role transitions keep hook count stable", () => {
    const cap = captureConsoleError();
    try {
      // State A: no posting rights
      const { rerender } = render(
        <CommentForm
          workspaceSlug="acme"
          contentItemId="ci-1"
          canPostClientVisible={false}
          canPostInternal={false}
          t={t}
        />,
      );
      // State B: full posting rights. Same instance.
      const err = runWithoutThrowing(() =>
        rerender(
          <CommentForm
            workspaceSlug="acme"
            contentItemId="ci-1"
            canPostClientVisible
            canPostInternal
            t={t}
          />,
        ),
      );
      cap.assertNoHooksOrderError();
      expect(err, err ? String(err) : "rerender threw").toBeNull();
    } finally {
      cap.restore();
    }
  });
});
