"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { humanize } from "@/lib/content/status";

/**
 * ApprovalTimeline — the "Approval requests" list under the workflow
 * bar on the content detail page. Extracted from `workflow-bar.tsx`
 * so the rendering of the approval request(s) lives in one typed
 * surface and the workflow bar is reduced to transition orchestration
 * (the click → action → revalidatePath plumbing).
 *
 * The component takes pre-shaped approval rows + the current actor's
 * role set + typed callbacks. The parent (WorkflowBar) is the only
 * place that knows how to talk to the server action; this component
 * is pure rendering + interaction.
 */

export type ApprovalRequest = {
  id: string;
  /** The gate is a known union at the DB layer; the page-level shape
   * types it as `string` for forward-compat with pre-migration data. */
  gate: "content" | "creative_internal" | "creative_client" | string;
  status: "pending" | "approved" | "changes_requested" | "cancelled" | string;
  requestedAt: string;
  deliveryVersionId: string | null;
};

export type ApprovalTimelineRoles = {
  isManager: boolean;
  isInternalReviewer: boolean;
  isClientReviewer: boolean;
};

export interface ApprovalTimelineProps {
  approvals: ApprovalRequest[];
  roles: ApprovalTimelineRoles;
  onApprove: (approvalRequestId: string) => void | Promise<void>;
  onRequestChanges: (approvalRequestId: string, feedback: string) => void | Promise<unknown>;
  /**
   * When true, render the action buttons disabled (the workflow is
   * locked — e.g. a transition is in flight). The buttons still
   * appear so the user understands the action exists.
   */
  disabled?: boolean;
}

function canActorDecide(request: ApprovalRequest, roles: ApprovalTimelineRoles): boolean {
  if (request.gate === "creative_internal") return roles.isInternalReviewer || roles.isManager;
  if (request.gate === "creative_client") return roles.isClientReviewer || roles.isManager;
  if (request.gate === "content") return roles.isInternalReviewer || roles.isManager;
  return false;
}

function statusVariant(status: string) {
  if (status === "approved") return "success" as const;
  if (status === "changes_requested") return "warning" as const;
  return "info" as const;
}

export function ApprovalTimeline({
  approvals,
  roles,
  onApprove,
  onRequestChanges,
  disabled = false,
}: ApprovalTimelineProps) {
  if (approvals.length === 0) return null;
  return (
    <div className="mt-4 space-y-1.5">
      <h3 className="text-label text-fg-muted tracking-wide uppercase">Approval requests</h3>
      {approvals.map((a) => {
        const canAct = a.status === "pending" && canActorDecide(a, roles);
        return (
          <div
            key={a.id}
            className="border-border bg-surface-subtle text-body flex flex-wrap items-center gap-3 rounded-[var(--radius-control)] border p-2"
          >
            <span className="font-semibold">{humanize(a.gate)}</span>
            <Badge variant={statusVariant(a.status)}>{a.status}</Badge>
            <span className="text-label text-fg-muted">
              {new Date(a.requestedAt).toLocaleString()}
            </span>
            {canAct ? (
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  disabled={disabled}
                  onClick={() => {
                    void onApprove(a.id);
                  }}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => {
                    const feedback = window.prompt("What needs to change?");
                    if (feedback) void onRequestChanges(a.id, feedback);
                  }}
                >
                  Request changes
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
