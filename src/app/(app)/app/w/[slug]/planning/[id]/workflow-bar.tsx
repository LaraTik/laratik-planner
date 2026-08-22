"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { transitionAction, decideApprovalAction, claimAction } from "../actions";
import { humanize } from "@/lib/content/status";
import { CheckCircle, XCircle, ArrowRight, Ban, Play } from "lucide-react";
import { ApprovalTimeline } from "@/components/workspace/approval-timeline";

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

  const run = (action: Parameters<typeof transitionAction>[0]["action"], reason?: string) => {
    start(async () => {
      try {
        await transitionAction({
          workspaceSlug,
          contentItemId,
          action,
          ...(reason ? { reason } : {}),
        });
      } catch (e) {
        alert((e as Error).message);
      }
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
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const reason = window.prompt("What needs to change?");
                if (reason) run("request_content_changes", reason);
              }}
            >
              <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Request changes
            </Button>
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
                try {
                  await claimAction({ workspaceSlug, contentItemId });
                } catch (e) {
                  alert((e as Error).message);
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
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              const reason = window.prompt("Reason for cancellation?");
              if (reason) run("cancel", reason);
            }}
          >
            <Ban className="h-3.5 w-3.5" aria-hidden="true" /> Cancel
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
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const reason = window.prompt("Reason for blocking?");
              if (reason) run("block", reason);
            }}
          >
            Block
          </Button>
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
              try {
                await decideApprovalAction({
                  workspaceSlug,
                  approvalRequestId,
                  decision: "approved",
                });
              } catch (e) {
                alert((e as Error).message);
              }
            })
          }
          onRequestChanges={(approvalRequestId, feedback) =>
            start(async () => {
              try {
                await decideApprovalAction({
                  workspaceSlug,
                  approvalRequestId,
                  decision: "changes_requested",
                  feedback,
                });
              } catch (e) {
                alert((e as Error).message);
              }
            })
          }
        />
      ) : null}
    </Card>
  );
}
