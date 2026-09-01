"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertOctagon, Check, TriangleAlert } from "lucide-react";
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
  resetAllIdeasAction,
  type ResetAllIdeasActionState,
} from "@/lib/content/reset-all-ideas-action";
import {
  ALL_CONTENT_STATUSES,
  CONTENT_STATUS_LABELS,
  type ResetAllIdeasCounts,
} from "@/lib/content/reset-all-ideas-shared";

/**
 * Bulk destructive "Reset all ideas" confirm dialog.
 *
 * Two-stage friction:
 *  1. The "includePublished" toggle starts OFF. The dialog shows
 *     a live count of how many LIVE ideas will be skipped, so the
 *     operator can decide whether to opt in.
 *  2. Once the toggle is settled, the operator must (a) type the
 *     workspace's name verbatim AND (b) supply a reason ≥ 8 chars
 *     before the destructive button enables.
 *
 * Submit goes through `resetAllIdeasAction`, which re-validates
 * the typed phrase against the live workspace name (server is the
 * source of truth). The action's audit row carries the full
 * workspace picture, the deleted idea IDs, the includePublished
 * toggle value, and the per-status breakdown.
 */
export function BulkResetConfirmDialog({
  open,
  onOpenChange,
  workspaceSlug,
  workspaceName,
  counts,
  t,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  workspaceSlug: string;
  workspaceName: string;
  counts: ResetAllIdeasCounts;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const action = resetAllIdeasAction.bind(null, workspaceSlug);
  const [state, formAction, pending] = useActionState<ResetAllIdeasActionState, FormData>(action, {
    ok: false,
    error: "",
  });

  // Toggle is local state so the dialog re-renders the count
  // preview without a server round-trip. The hidden input carries
  // the value through form submit.
  const [includePublished, setIncludePublished] = React.useState(false);
  const [typedPhrase, setTypedPhrase] = React.useState("");
  const [reason, setReason] = React.useState("");

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (next) {
        setIncludePublished(false);
        setTypedPhrase("");
        setReason("");
      }
      onOpenChange(next);
    },
    [onOpenChange],
  );

  // Preview the count the operator is about to commit to.
  const previewTotal = includePublished ? counts.totalAllIdeas : counts.total;
  const previewExcluded = includePublished ? 0 : counts.totalExcludedByDefault;

  const typedPhraseMatches = typedPhrase === workspaceName;
  const reasonLongEnough = reason.trim().length >= 8;
  const canSubmit = typedPhraseMatches && reasonLongEnough && !pending;

  const fieldErrors = state && "fieldErrors" in state ? state.fieldErrors : undefined;
  const generalError = state && "error" in state ? state.error : undefined;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-2xl"
        data-testid="bulk-reset-confirm-dialog"
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <div className="text-danger flex items-center gap-2">
            <AlertOctagon className="h-5 w-5" aria-hidden="true" />
            <DialogTitle>{t("settings.bulkReset.dialogTitle")}</DialogTitle>
          </div>
          <DialogDescription>
            {t("settings.bulkReset.dialogBody", { name: workspaceName })}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4" data-testid="bulk-reset-confirm-form">
          {/* Hidden input drives the includePublished flag. The */}
          {/* server reads it as "true" / "false" (string). */}
          <input
            type="hidden"
            name="includePublished"
            value={includePublished ? "true" : "false"}
          />

          <section
            aria-labelledby="bulk-reset-counts-heading"
            className="border-danger/30 bg-danger-subtle rounded-[var(--radius-control)] border p-3"
          >
            <h3
              id="bulk-reset-counts-heading"
              className="text-body text-fg-primary mb-2 font-semibold"
            >
              {t("settings.bulkReset.countsHeading")}
            </h3>
            <p className="text-label text-fg-secondary mb-3">
              {t("settings.bulkReset.countsPreview", {
                count: previewTotal,
                excluded: previewExcluded,
              })}
            </p>
            <dl className="grid gap-1 sm:grid-cols-2">
              {ALL_CONTENT_STATUSES.map((status) => {
                // When includePublished is OFF, hide the live rows
                // entirely — the operator explicitly opted out, no
                // need to see the count.
                if (
                  !includePublished &&
                  (status === "published" || status === "partially_published")
                ) {
                  return null;
                }
                const value = counts.byStatus[status] ?? 0;
                return (
                  <div
                    key={status}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                    data-testid={`bulk-reset-bucket-${status}`}
                  >
                    <dt className="text-fg-secondary">{CONTENT_STATUS_LABELS[status]}</dt>
                    <dd
                      className={
                        value === 0
                          ? "text-fg-muted font-mono text-xs"
                          : "text-fg-primary font-mono font-semibold"
                      }
                    >
                      {value}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>

          <div className="space-y-1.5">
            <div className="flex items-start gap-3">
              <input
                id="bulk-reset-include-published"
                type="checkbox"
                checked={includePublished}
                onChange={(event) => setIncludePublished(event.target.checked)}
                className="border-border text-danger focus-visible:ring-focus-ring mt-0.5 h-4 w-4 rounded"
                data-testid="bulk-reset-include-published"
              />
              <div className="space-y-1">
                <Label htmlFor="bulk-reset-include-published" className="cursor-pointer">
                  {t("settings.bulkReset.includePublishedLabel")}
                </Label>
                <p className="text-label text-fg-muted">
                  {t("settings.bulkReset.includePublishedHint")}
                </p>
              </div>
            </div>
            {includePublished && counts.totalLive > 0 ? (
              <p
                role="alert"
                data-testid="bulk-reset-live-warning"
                className="border-warning/30 bg-warning-subtle text-body text-fg-primary mt-2 flex items-start gap-2 rounded-[var(--radius-control)] border p-3"
              >
                <TriangleAlert
                  className="text-warning mt-0.5 h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
                <span>{t("settings.bulkReset.liveWarning", { count: counts.totalLive })}</span>
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bulk-reset-typed-phrase">
              {t("settings.bulkReset.typedPhraseLabel")}
            </Label>
            <p id="bulk-reset-typed-phrase-help" className="text-label text-fg-muted -mt-0.5">
              {t("settings.bulkReset.typedPhraseHelp", { name: workspaceName })}
            </p>
            <Input
              id="bulk-reset-typed-phrase"
              name="typedPhrase"
              value={typedPhrase}
              onChange={(event) => setTypedPhrase(event.target.value)}
              required
              autoComplete="off"
              spellCheck={false}
              aria-required="true"
              aria-describedby="bulk-reset-typed-phrase-help"
              aria-invalid={Boolean(fieldErrors?.typedPhrase) || undefined}
              className={
                typedPhrase.length > 0 && !typedPhraseMatches ? "border-danger" : undefined
              }
              data-testid="bulk-reset-typed-phrase"
            />
            {fieldErrors?.typedPhrase ? (
              <p role="alert" className="text-label text-danger">
                {fieldErrors.typedPhrase}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bulk-reset-reason">{t("settings.bulkReset.reasonLabel")}</Label>
            <p id="bulk-reset-reason-help" className="text-label text-fg-muted -mt-0.5">
              {t("settings.bulkReset.reasonHelp")}
            </p>
            <Textarea
              id="bulk-reset-reason"
              name="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              minLength={8}
              maxLength={2000}
              rows={3}
              aria-required="true"
              aria-describedby="bulk-reset-reason-help"
              aria-invalid={Boolean(fieldErrors?.reason) || undefined}
              data-testid="bulk-reset-reason"
            />
            {fieldErrors?.reason ? (
              <p role="alert" className="text-label text-danger">
                {fieldErrors.reason}
              </p>
            ) : null}
          </div>

          {generalError ? (
            <p
              role="alert"
              data-testid="bulk-reset-error"
              className="border-danger/30 bg-danger-subtle text-body text-danger rounded-[var(--radius-control)] border p-3"
            >
              {generalError}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
              disabled={pending}
              data-testid="bulk-reset-cancel"
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!canSubmit}
              aria-busy={pending || undefined}
              data-testid="bulk-reset-submit"
            >
              {pending ? (
                t("settings.bulkReset.submitting")
              ) : (
                <>
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {t("settings.bulkReset.submitCount", { count: previewTotal })}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
