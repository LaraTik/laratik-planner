"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { transitionAction, decideApprovalAction, claimAction } from "../actions";
import { humanize } from "@/lib/content/status";
import { CheckCircle, XCircle, ArrowRight, Ban, Play } from "lucide-react";

type Role =
  | "isManager"
  | "isPlanner"
  | "isDesigner"
  | "isInternalReviewer"
  | "isClientReviewer"
  | "isPublisher";

const STATUSES = [
  "draft",
  "content_review",
  "approved_for_design",
  "in_design",
  "creative_review",
  "ready_to_publish",
  "partially_published",
  "published",
];

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
        {STATUSES.map((s) => {
          const idx = STATUSES.indexOf(status);
          const sIdx = STATUSES.indexOf(s);
          const past = sIdx < idx;
          const current = s === status;
          return (
            <Badge key={s} variant={current ? "primary" : past ? "success" : "outline"}>
              {humanize(s)}
            </Badge>
          );
        })}
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
        <div className="mt-4 space-y-1.5">
          <h3 className="text-label text-fg-muted tracking-wide uppercase">Approval requests</h3>
          {approvals.map((a) => (
            <div
              key={a.id}
              className="border-border bg-surface-subtle text-body flex flex-wrap items-center gap-3 rounded-[var(--radius-control)] border p-2"
            >
              <span className="font-semibold">{humanize(a.gate)}</span>
              <Badge
                variant={
                  a.status === "approved"
                    ? "success"
                    : a.status === "changes_requested"
                      ? "warning"
                      : "info"
                }
              >
                {a.status}
              </Badge>
              <span className="text-label text-fg-muted">
                {new Date(a.requestedAt).toLocaleString()}
              </span>
              {a.status === "pending" &&
              ((a.gate === "creative_internal" && roles.isInternalReviewer) ||
                (a.gate === "creative_client" && roles.isClientReviewer) ||
                (a.gate === "content" && roles.isInternalReviewer)) ? (
                <div className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        try {
                          await decideApprovalAction({
                            workspaceSlug,
                            approvalRequestId: a.id,
                            decision: "approved",
                          });
                        } catch (e) {
                          alert((e as Error).message);
                        }
                      })
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => {
                      const feedback = window.prompt("What needs to change?");
                      if (feedback)
                        start(async () => {
                          try {
                            await decideApprovalAction({
                              workspaceSlug,
                              approvalRequestId: a.id,
                              decision: "changes_requested",
                              feedback,
                            });
                          } catch (e) {
                            alert((e as Error).message);
                          }
                        });
                    }}
                  >
                    Request changes
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
