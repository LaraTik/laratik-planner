"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertOctagon, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  deleteWorkspaceTrendDataAction,
  type DeleteTrendDataActionState,
} from "@/lib/trends/delete-workspace-trend-data-action";
import { useLocaleT } from "@/components/i18n/locale-provider";

/**
 * GDPR "Delete my trend data" confirm dialog.
 *
 * Two-stage friction, mirroring the bulk-reset-all-ideas flow:
 *   1. The operator must (a) type the workspace's name verbatim
 *      AND (b) supply a reason ≥ 8 chars before the destructive
 *      button enables.
 *
 * Submit goes through `deleteWorkspaceTrendDataAction`, which
 * re-validates the typed phrase against the live workspace name
 * (server is the source of truth) and writes a single
 * `security_audit_event` row carrying the per-table delete counts.
 *
 * The `counts` prop is optional; when present the dialog surfaces
 * the "this will delete N rows" preview so the operator can make
 * an informed call. When absent (the agency admin is opening the
 * dialog for the first time), the dialog still requires the typed
 * phrase to commit.
 */
export function DeleteTrendDataConfirmDialog({
  open,
  onOpenChange,
  workspaceSlug,
  workspaceName,
  counts,
  t: tProp,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  workspaceSlug: string;
  workspaceName: string;
  counts?: {
    trendSignals: number;
    trendBoards: number;
    trendBoardItems: number;
    trendBriefs: number;
    trendFeedback: number;
    trendSourceHealth: number;
    trendSourceActivity: number;
  };
  t?: (key: string, params?: Record<string, string | number>) => string;
}) {
  const localeT = useLocaleT();
  const t = tProp ?? localeT;
  const action = deleteWorkspaceTrendDataAction.bind(null, workspaceSlug);
  const [state, formAction, pending] = useActionState<DeleteTrendDataActionState, FormData>(
    action,
    {
      ok: false,
      error: "",
    },
  );

  const [typedPhrase, setTypedPhrase] = React.useState("");
  const [reason, setReason] = React.useState("");

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (next) {
        setTypedPhrase("");
        setReason("");
      }
      onOpenChange(next);
    },
    [onOpenChange],
  );

  const typedPhraseMatches = typedPhrase === workspaceName;
  const reasonLongEnough = reason.trim().length >= 8;
  const canSubmit = typedPhraseMatches && reasonLongEnough && !pending;

  const fieldErrors = state && "fieldErrors" in state ? state.fieldErrors : undefined;
  const generalError = state && "error" in state ? state.error : undefined;

  const total = counts
    ? counts.trendSignals +
      counts.trendBoards +
      counts.trendBoardItems +
      counts.trendBriefs +
      counts.trendFeedback +
      counts.trendSourceHealth +
      counts.trendSourceActivity
    : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="delete-trend-data-dialog">
        <DialogHeader>
          <div className="text-danger flex items-center gap-2">
            <AlertOctagon className="h-5 w-5" aria-hidden="true" />
            <DialogTitle>
              {t("trends.deleteData.dialogTitle") || "Delete all trend data in this workspace"}
            </DialogTitle>
          </div>
          <DialogDescription>
            {t("trends.deleteData.dialogBody", { name: workspaceName }) ||
              `This will permanently delete all your trend data in ${workspaceName}. This cannot be undone.`}
          </DialogDescription>
        </DialogHeader>

        {total !== null ? (
          <div className="border-border bg-surface-subtle rounded-[var(--radius-control)] border p-3">
            <p className="text-label text-fg-muted mb-2 font-semibold tracking-wide uppercase">
              {t("trends.deleteData.countsHeading") || "What will be deleted"}
            </p>
            <ul className="text-body text-fg-secondary space-y-1 text-sm">
              <li>
                {t("trends.deleteData.counts.signals", { count: counts!.trendSignals }) ||
                  `${counts!.trendSignals} trend signals`}
              </li>
              <li>
                {t("trends.deleteData.counts.boards", { count: counts!.trendBoards }) ||
                  `${counts!.trendBoards} trend boards`}
              </li>
              <li>
                {t("trends.deleteData.counts.boardItems", { count: counts!.trendBoardItems }) ||
                  `${counts!.trendBoardItems} trend board items`}
              </li>
              <li>
                {t("trends.deleteData.counts.briefs", { count: counts!.trendBriefs }) ||
                  `${counts!.trendBriefs} trend briefs`}
              </li>
              <li>
                {t("trends.deleteData.counts.feedback", { count: counts!.trendFeedback }) ||
                  `${counts!.trendFeedback} trend feedback events`}
              </li>
              <li>
                {t("trends.deleteData.counts.sourceHealth", { count: counts!.trendSourceHealth }) ||
                  `${counts!.trendSourceHealth} source health snapshots`}
              </li>
              <li>
                {t("trends.deleteData.counts.sourceActivity", {
                  count: counts!.trendSourceActivity,
                }) || `${counts!.trendSourceActivity} source activity entries`}
              </li>
            </ul>
          </div>
        ) : null}

        <form action={formAction} className="space-y-3" data-testid="delete-trend-data-form">
          <div>
            <Label htmlFor="typedPhrase">
              {t("trends.deleteData.typedPhraseLabel") || "Type the workspace's name to confirm"}
            </Label>
            <Input
              id="typedPhrase"
              name="typedPhrase"
              value={typedPhrase}
              onChange={(e) => setTypedPhrase(e.target.value)}
              placeholder={workspaceName}
              data-testid="delete-trend-data-typed-phrase"
            />
            <p className="text-label text-fg-muted mt-1">
              {t("trends.deleteData.typedPhraseHelp", { name: workspaceName }) ||
                `Type ${workspaceName} exactly.`}
            </p>
            {fieldErrors?.typedPhrase ? (
              <p
                className="text-label text-danger mt-1"
                data-testid="delete-trend-data-error-typed-phrase"
              >
                {fieldErrors.typedPhrase}
              </p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="reason">{t("trends.deleteData.reasonLabel") || "Reason"}</Label>
            <Textarea
              id="reason"
              name="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              data-testid="delete-trend-data-reason"
            />
            <p className="text-label text-fg-muted mt-1">
              {t("trends.deleteData.reasonHelp") ||
                "At least 8 characters. Saved to the platform audit log alongside the per-table delete counts."}
            </p>
            {fieldErrors?.reason ? (
              <p
                className="text-label text-danger mt-1"
                data-testid="delete-trend-data-error-reason"
              >
                {fieldErrors.reason}
              </p>
            ) : null}
          </div>

          {generalError ? (
            <div
              className="border-danger/30 bg-danger-subtle text-danger flex items-start gap-2 rounded-[var(--radius-control)] border p-3 text-sm"
              data-testid="delete-trend-data-error-general"
            >
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>{generalError}</p>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={pending}
              data-testid="delete-trend-data-cancel"
            >
              {t("trends.deleteData.cancel") || "Cancel"}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!canSubmit}
              data-testid="delete-trend-data-submit"
            >
              {pending
                ? t("trends.deleteData.submitting") || "Deleting…"
                : t("trends.deleteData.submit") || "Delete all trend data"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
