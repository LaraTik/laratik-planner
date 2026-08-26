"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { transitionAction, decideApprovalAction, claimAction } from "../actions";
import { humanize } from "@/lib/content/status";
import { CheckCircle, XCircle, ArrowRight, Ban, Play } from "lucide-react";
import { ApprovalTimeline } from "@/components/workspace/approval-timeline";
import { ReasonDialog } from "@/components/forms/reason-dialog";

type Role =
  | "isManager"
  | "isPlanner"
  | "isDesigner"
  | "isInternalReviewer"
  | "isClientReviewer"
  | "isPublisher";

// Full workflow ladder including every status the content state machine
// can produce. The earlier 8-item list was missing `changes_requested`,
// `blocked`, and `cancelled`, which caused `STATUSES.indexOf(status)` to
// return -1 for those branch states. With idx = -1 the `sIdx < idx` past
// predicate was never true, so every badge rendered as `outline` and the
// current state was invisible. The minified production build also
// surfaced this as React error #441 (server components render) on
// post-action revalidation, because the inconsistent status set made
// the rendered HTML diverge from the client's expected shape during
// the re-render that follows `transitionContent`'s
// `revalidatePath("/app/w/")` call.
const STATUSES = [
  "draft",
  "content_review",
  "changes_requested",
  "approved_for_design",
  "in_design",
  "creative_review",
  "ready_to_publish",
  "partially_published",
  "published",
  "blocked",
  "cancelled",
] as const;

export function WorkflowBar({
  workspaceSlug,
  contentItemId,
  status,
  blockedReason,
  cancellationReason,
  roles,
  approvals,
}: {
  workspaceSlug: string;
  contentItemId: string;
  status: string;
  blockedReason: string | null;
  cancellationReason: string | null;
  roles: Record<Role, boolean>;
  approvals: {
    id: string;
    gate: string;
    status: string;
    requestedAt: string;
    deliveryVersionId: string | null;
  }[];
}) {
  const [pending, start] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const executeTransition = async (
    action: Parameters<typeof transitionAction>[0]["action"],
    reason?: string,
  ) => {
    setActionError(null);
    // Read the action's return value (an `{ error?: string }` shape) rather
    // than relying on a rejected promise. Next.js 16 encodes thrown action
    // errors as a hashed digest in the RSC response, dropping the original
    // message — the client would otherwise see a generic minified React
    // error instead of the action's real text.
    const result = await transitionAction({
      workspaceSlug,
      contentItemId,
      action,
      ...(reason ? { reason } : {}),
    });
    if (result?.error) {
      setActionError(result.error);
    }
  };

  const run = (action: Parameters<typeof transitionAction>[0]["action"], reason?: string) => {
    start(async () => {
      await executeTransition(action, reason).catch(() => undefined);
    });
  };

  const can = (allowed: Role[]) => allowed.some((r) => roles[r]);

  return (
    <Card>
      <CardTitle className="mb-3">Workflow</CardTitle>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {(() => {
          // Compute `idx` once per render instead of inside the map
          // (O(n²) → O(n)). The `>= 0` guard keeps `past` correct for
          // any unexpected status the page might pass in before the
          // render throws — see the comment on STATUSES above for why
          // this matters on the post-`revalidatePath` re-render.
          const idx = STATUSES.indexOf(status as (typeof STATUSES)[number]);
          return STATUSES.map((s) => {
            const sIdx = STATUSES.indexOf(s);
            const past = idx >= 0 && sIdx >= 0 && sIdx < idx;
            const current = s === status;
            return (
              <Badge key={s} variant={current ? "primary" : past ? "success" : "outline"}>
                {humanize(s)}
              </Badge>
            );
          });
        })()}
      </div>

      {blockedReason ? (
        <p className="text-body text-danger mb-3">
          <Ban className="mr-1 inline h-4 w-4" aria-hidden="true" />
          Blocked: {blockedReason}
        </p>
      ) : null}
      {cancellationReason ? (
        <p className="text-body text-danger mb-3">
          <Ban className="mr-1 inline h-4 w-4" aria-hidden="true" />
          Cancelled: {cancellationReason}
        </p>
      ) : null}

      {actionError ? (
        <p role="alert" className="text-body text-danger mb-3">
          {actionError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {status === "draft" && can(["isManager", "isPlanner"]) ? (
          <Button size="sm" onClick={() => run("submit_content_review")}>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /> Submit for review
          </Button>
        ) : null}
        {status === "content_review" && can(["isInternalReviewer", "isManager"]) ? (
          <>
            <Button size="sm" onClick={() => run("approve_content")}>
              <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" /> Approve
            </Button>
            <ReasonDialog
              trigger={
                <Button size="sm" variant="secondary" disabled={pending}>
                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Request changes
                </Button>
              }
              title="Request content changes"
              description="Describe the revision needed before this content can move forward."
              confirmLabel="Request changes"
              disabled={pending}
              onConfirm={(reason) => executeTransition("request_content_changes", reason)}
            />
          </>
        ) : null}
        {status === "changes_requested" && can(["isManager", "isPlanner"]) ? (
          <Button size="sm" onClick={() => run("resubmit_content")}>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /> Resubmit
          </Button>
        ) : null}
        {status === "approved_for_design" && roles.isDesigner ? (
          <Button
            size="sm"
            onClick={() =>
              start(async () => {
                setActionError(null);
                // Same rationale as `executeTransition` above — read the
                // return value rather than relying on a thrown error.
                const result = await claimAction({ workspaceSlug, contentItemId });
                if (result?.error) {
                  setActionError(result.error);
                }
              })
            }
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" /> Claim as designer
          </Button>
        ) : null}
        {status === "approved_for_design" && roles.isManager ? (
          <Button size="sm" onClick={() => run("assign_designer")}>
            Assign designer
          </Button>
        ) : null}
        {status === "blocked" && roles.isManager ? (
          <Button size="sm" onClick={() => run("unblock")}>
            Unblock
          </Button>
        ) : null}
        {[
          "draft",
          "content_review",
          "approved_for_design",
          "in_design",
          "creative_review",
          "ready_to_publish",
        ].includes(status) && roles.isManager ? (
          <ReasonDialog
            trigger={
              <Button size="sm" variant="destructive" disabled={pending}>
                <Ban className="h-3.5 w-3.5" aria-hidden="true" /> Cancel
              </Button>
            }
            title="Cancel content item"
            description="This removes the item from the active workflow. Record why it is being cancelled."
            confirmLabel="Cancel item"
            destructive
            disabled={pending}
            onConfirm={(reason) => executeTransition("cancel", reason)}
          />
        ) : null}
        {[
          "draft",
          "content_review",
          "approved_for_design",
          "in_design",
          "creative_review",
          "ready_to_publish",
        ].includes(status) && roles.isManager ? (
          <ReasonDialog
            trigger={
              <Button size="sm" variant="secondary" disabled={pending}>
                Block
              </Button>
            }
            title="Block content item"
            description="Explain what is preventing progress so the team can resolve it."
            confirmLabel="Block item"
            disabled={pending}
            onConfirm={(reason) => executeTransition("block", reason)}
          />
        ) : null}
      </div>

      {approvals.length > 0 ? (
        <ApprovalTimeline
          approvals={approvals}
          roles={{
            isManager: roles.isManager,
            isInternalReviewer: roles.isInternalReviewer,
            isClientReviewer: roles.isClientReviewer,
          }}
          disabled={pending}
          onApprove={(approvalRequestId) =>
            start(async () => {
              setActionError(null);
              const result = await decideApprovalAction({
                workspaceSlug,
                approvalRequestId,
                decision: "approved",
              });
              if (result?.error) {
                setActionError(result.error);
              }
            })
          }
          onRequestChanges={async (approvalRequestId, feedback) => {
            setActionError(null);
            const result = await decideApprovalAction({
              workspaceSlug,
              approvalRequestId,
              decision: "changes_requested",
              feedback,
            });
            if (result?.error) {
              setActionError(result.error);
            }
          }}
        />
      ) : null}
    </Card>
  );
}
