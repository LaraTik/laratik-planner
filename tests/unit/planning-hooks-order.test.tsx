import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

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

import { WorkflowBar } from "@/app/(app)/app/w/[slug]/planning/[id]/workflow-bar";
import { DeliverySection } from "@/app/(app)/app/w/[slug]/planning/[id]/delivery-section";
import { PublishingSection } from "@/app/(app)/app/w/[slug]/planning/[id]/publishing-section";
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
  it("WorkflowBar: same instance, role/approval state transitions keep hook count stable", () => {
    const cap = captureConsoleError();
    try {
      const { rerender } = render(
        <WorkflowBar
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
        />,
      );
      // Same instance, different prop state.
      const err = runWithoutThrowing(() =>
        rerender(
          <WorkflowBar
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

  it("PublishingSection: same instance, empty/populated channels keep hook count stable", () => {
    const cap = captureConsoleError();
    try {
      // State A: zero channels (would early-return null)
      const { rerender } = render(
        <PublishingSection
          workspaceSlug="acme"
          contentItemId="ci-1"
          channels={[]}
          publications={[]}
          isPublisher={false}
          isManager={false}
        />,
      );
      // State B: channels present, manager. Same instance.
      const err = runWithoutThrowing(() =>
        rerender(
          <PublishingSection
            workspaceSlug="acme"
            contentItemId="ci-1"
            channels={[
              {
                id: "cic-1",
                accountName: "@acme",
                platform: "instagram",
                plannedPublishAtOverride: null,
              },
            ]}
            publications={[]}
            isPublisher
            isManager
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
