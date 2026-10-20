"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { humanize } from "@/lib/content/status";
import { ReasonDialog } from "@/components/forms/reason-dialog";
import { useLocaleCode, useLocaleT } from "@/components/i18n/locale-provider";
import { DateFormat, formatDate } from "@/lib/i18n/format-locale";
import { isMissingTranslation } from "@/messages";

/**
 * ApprovalTimeline — the "Approval requests" list under the workflow
 * bar on the content detail page. Extracted from the legacy
 * `workflow-bar.tsx` (which was deleted in the planning-detail
 * refactor on 2026-08-30; the workflow now lives in
 * `@/components/planning/workflow-rail.tsx`) so the rendering
 * of the approval request(s) lives in one typed surface and the
 * rail is reduced to transition orchestration (the click → action
 * → revalidatePath plumbing).
 *
 * The component takes pre-shaped approval rows + the current actor's
 * role set + typed callbacks. The parent (WorkflowRail) is the only
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
  /**
   * The agency admin holds full authority on every approval gate
   * (master prompt §9) but is not an `internal_reviewer` or a
   * `client_reviewer`, so the admin override has to be carried
   * explicitly. The plain workspace manager holds NO approval
   * authority at all — §9 gives content approval to the internal
   * reviewer and client creative review to the assigned client
   * reviewer — so `isManager` is not an override here.
   */
  isAgencyAdmin: boolean;
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
  /**
   * Optional translator. When provided, the section title +
   * "Request changes" dialog copy resolves to
   * `workspaceOverviewDashboard.workflow.{requestChanges,...}`; when
   * omitted, the hard-coded English copy is used.
   */
  t?: (key: string, params?: Record<string, string | number>) => string;
}

function canActorDecide(request: ApprovalRequest, roles: ApprovalTimelineRoles): boolean {
  if (request.gate === "creative_internal") {
    return roles.isInternalReviewer || roles.isAgencyAdmin;
  }
  if (request.gate === "creative_client") {
    return roles.isClientReviewer || roles.isAgencyAdmin;
  }
  if (request.gate === "content") {
    // The content gate is decided by the WORKFLOW command, not by
    // this timeline: `decideApproval` refuses a content-gate request
    // outright ("Content approvals must use the content workflow
    // command"), because the content transition also owns the item's
    // status change. Rendering Approve / Request changes here would
    // offer a button that can only ever fail. The rail's own
    // "Approve content" / "Request changes" actions — gated to the
    // internal reviewer — are the working path.
    return false;
  }
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
  t,
}: ApprovalTimelineProps) {
  const locale = useLocaleCode();
  const localeT = useLocaleT();
  const tr = (key: string, fallback: string) => {
    const value = t ? t(key) : localeT(key);
    return isMissingTranslation(value, key) ? fallback : value;
  };
  const translateKnown = (key: string, fallback: string) => {
    return tr(key, fallback);
  };
  if (approvals.length === 0) return null;
  return (
    <div className="mt-4 space-y-1.5">
      <h3 className="text-label text-fg-muted tracking-wide uppercase">
        {tr("workspaceOverviewDashboard.workflow.approvalRequests", "Approval requests")}
      </h3>
      {approvals.map((a) => {
        const canAct = a.status === "pending" && canActorDecide(a, roles);
        return (
          <div
            key={a.id}
            className="border-border bg-surface-subtle text-body flex flex-wrap items-center gap-3 rounded-[var(--radius-control)] border p-2"
            data-testid={`approval-request-${a.gate}`}
          >
            <span className="font-semibold">
              {translateKnown(`contentDetail.workflow.approvalGates.${a.gate}`, humanize(a.gate))}
            </span>
            <Badge variant={statusVariant(a.status)}>
              {translateKnown(
                `contentDetail.workflow.approvalStatuses.${a.status}`,
                humanize(a.status),
              )}
            </Badge>
            <span className="text-label text-fg-muted">
              {formatDate(a.requestedAt, locale, DateFormat.dateTime)}
            </span>
            {canAct ? (
              <div className="ms-auto flex gap-2">
                <Button
                  size="sm"
                  disabled={disabled}
                  onClick={() => {
                    void onApprove(a.id);
                  }}
                >
                  {tr("contentDetail.workflow.approve", "Approve")}
                </Button>
                <ReasonDialog
                  trigger={
                    <Button size="sm" variant="secondary" disabled={disabled}>
                      {tr("workspaceOverviewDashboard.workflow.requestChanges", "Request changes")}
                    </Button>
                  }
                  title={tr(
                    "workspaceOverviewDashboard.workflow.requestChanges",
                    "Request changes",
                  )}
                  description={tr(
                    "workspaceOverviewDashboard.workflow.requestChangesDescription",
                    "Explain what needs to change so the assignee can act without guesswork.",
                  )}
                  label={tr("workspaceOverviewDashboard.workflow.feedbackLabel", "Feedback")}
                  confirmLabel={tr(
                    "workspaceOverviewDashboard.workflow.sendRequest",
                    "Send request",
                  )}
                  {...(t ? { closeAriaLabel: t("common.dialogCloseAria") } : {})}
                  disabled={disabled}
                  onConfirm={(feedback) => onRequestChanges(a.id, feedback)}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
