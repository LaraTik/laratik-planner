"use client";

import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  transitionAction,
  decideApprovalAction,
  claimAction,
  assignDesignerAction,
} from "../actions";
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
  designers,
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
  /**
   * Active designers in the workspace. Populated by the planning detail
   * page from `listWorkspaceDesigners`. The picker dialog is only
   * rendered when this list is non-empty; if the workspace has no
   * designers, the manager can either (a) wait for a designer to
   * self-claim via the "Claim as designer" button on the same bar, or
   * (b) invite a designer from the workspace settings page.
   */
  designers: { id: string; label: string }[];
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
              <Badge
                key={s}
                variant={current ? "primary" : past ? "success" : "outline"}
                data-testid={current ? "status-current" : undefined}
                data-status={s}
              >
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
          <AssignDesignerDialog
            designers={designers}
            disabled={pending}
            onConfirm={async (designerId) => {
              setActionError(null);
              const result = await assignDesignerAction({
                workspaceSlug,
                contentItemId,
                designerId,
              });
              if (result?.error) setActionError(result.error);
            }}
          />
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

/**
 * Manager-driven designer assignment. Opens a Radix dialog with a
 * `<select>` of active designers in the workspace, calls the
 * `assignDesignerAction` server action on confirm, and surfaces the
 * action's error string in the parent bar.
 *
 * Accessibility:
 *  - `<label>` is bound to the `<select>` via `htmlFor`/`id` (useId).
 *  - The dialog body is keyboard-navigable; the confirm button is the
 *    form's submit target.
 *  - When the workspace has no designers, the trigger button is
 *    disabled and the dialog is hidden — the user must invite a
 *    designer (workspace settings) or wait for a self-claim.
 */
function AssignDesignerDialog({
  designers,
  disabled,
  onConfirm,
}: {
  designers: { id: string; label: string }[];
  disabled: boolean;
  onConfirm: (designerId: string) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(designers[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectId = useId();
  const errorId = `${selectId}-error`;
  const hasDesigners = designers.length > 0;

  async function submit() {
    if (!selectedId) {
      setError("Pick a designer to assign.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(selectedId);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The assign action failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          disabled={disabled || !hasDesigners}
          data-testid="assign-designer-trigger"
        >
          Assign designer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign a designer</DialogTitle>
          <DialogDescription>
            Pick the designer who will own this design task. They&apos;ll be notified and the item
            will move into the &quot;in design&quot; state.
          </DialogDescription>
        </DialogHeader>
        {hasDesigners ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div>
              <label
                htmlFor={selectId}
                className="text-body text-fg-primary mb-1 block font-semibold"
              >
                Designer
              </label>
              <select
                id={selectId}
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
                className="border-border bg-surface text-body min-h-11 w-full rounded-[var(--radius-control)] border px-2 py-1"
                data-testid="assign-designer-select"
                autoFocus
                aria-invalid={Boolean(error)}
                aria-describedby={error ? errorId : undefined}
              >
                {designers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
              {error ? (
                <p id={errorId} role="alert" className="text-label text-danger mt-1">
                  {error}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary" disabled={submitting}>
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={submitting || !selectedId}
                data-testid="assign-designer-confirm"
              >
                {submitting ? "Assigning…" : "Assign"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <p className="text-body text-fg-secondary">
            No designers in this workspace yet. Invite one from Settings, or wait for a designer to
            claim the item themselves.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
