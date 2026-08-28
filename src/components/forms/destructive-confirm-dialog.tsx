"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertOctagon, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { resetIdeaAction, type ResetIdeaActionState } from "@/lib/content/reset-idea-action";
import { RESET_IDEA_BUCKETS, type ResetIdeaCounts } from "@/lib/content/reset-idea-shared";

/**
 * Destructive "Reset idea" confirm dialog.
 *
 * The strongest friction short of a re-auth: the operator must
 * (a) read the per-table count table so they know exactly what
 * they're about to remove, (b) type the idea's title verbatim, and
 * (c) supply a reason of at least 8 characters. Only when all three
 * are valid does the destructive button enable.
 *
 * The submit goes through `resetIdeaAction` (server side), which
 * re-validates the typed phrase against the LIVE title (never trust
 * the page's title — the operator may have the page stale or be
 * hitting a forged form).
 *
 * The bucket labels in `RESET_IDEA_BUCKETS` distinguish cascade
 * (deleted) from set-null (orphaned with `content_item_id = NULL`).
 * Operators can see at a glance that the workspace, agency,
 * settings, brand kit, and social channels are NOT in the list —
 * those are untouched by the destructive operation.
 */
export function DestructiveConfirmDialog({
  open,
  onOpenChange,
  workspaceSlug,
  contentItemId,
  ideaTitle,
  counts,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  workspaceSlug: string;
  contentItemId: string;
  ideaTitle: string;
  counts: ResetIdeaCounts;
}) {
  const action = resetIdeaAction.bind(null, workspaceSlug);
  const [state, formAction, pending] = useActionState<ResetIdeaActionState, FormData>(action, {
    ok: false,
    error: "",
  });

  const [typedPhrase, setTypedPhrase] = React.useState("");
  const [reason, setReason] = React.useState("");

  // Reset transient state when the dialog opens so a stale typed
  // phrase from a previous session can't be autofilled. We
  // intercept the open transition via the `onOpenChange` handler
  // rather than a `useEffect` to avoid the cascading-render lint
  // rule (set-state in effect).
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

  const typedPhraseMatches = typedPhrase === ideaTitle;
  const reasonLongEnough = reason.trim().length >= 8;
  const canSubmit = typedPhraseMatches && reasonLongEnough && !pending;

  const fieldErrors = state && "fieldErrors" in state ? state.fieldErrors : undefined;
  const generalError = state && "error" in state ? state.error : undefined;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-xl"
        data-testid="destructive-confirm-dialog"
        onEscapeKeyDown={(event) => {
          // Don't let Esc close the dialog mid-typing — operators
          // can lose typed phrase + reason easily. They can cancel
          // via the explicit button.
          event.preventDefault();
        }}
      >
        <DialogHeader>
          <div className="text-danger flex items-center gap-2">
            <AlertOctagon className="h-5 w-5" aria-hidden="true" />
            <DialogTitle>Reset this idea</DialogTitle>
          </div>
          <DialogDescription>
            This permanently deletes the idea and every child row that references it. Workspace
            settings, channels, the brand kit, and other ideas in the agency are not affected.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4" data-testid="destructive-confirm-form">
          <input type="hidden" name="contentItemId" value={contentItemId} />

          <section
            aria-labelledby="destructive-counts-heading"
            className="border-danger/30 bg-danger-subtle rounded-[var(--radius-control)] border p-3"
          >
            <h3
              id="destructive-counts-heading"
              className="text-body text-fg-primary mb-2 font-semibold"
            >
              What will be deleted
            </h3>
            <dl className="space-y-1">
              {RESET_IDEA_BUCKETS.map((bucket) => {
                const value = counts[bucket.key];
                return (
                  <div
                    key={bucket.key}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                    data-testid={`destructive-bucket-${bucket.key}`}
                  >
                    <dt className="text-fg-secondary">{bucket.label}</dt>
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
            <Label htmlFor="destructive-typed-phrase">Type the idea&apos;s title to confirm</Label>
            <p id="destructive-typed-phrase-help" className="text-label text-fg-muted -mt-0.5">
              Type <span className="text-fg-primary font-mono">{ideaTitle}</span> exactly.
            </p>
            <Input
              id="destructive-typed-phrase"
              name="typedPhrase"
              value={typedPhrase}
              onChange={(event) => setTypedPhrase(event.target.value)}
              required
              autoComplete="off"
              spellCheck={false}
              aria-required="true"
              aria-describedby="destructive-typed-phrase-help"
              aria-invalid={Boolean(fieldErrors?.typedPhrase) || undefined}
              className={
                typedPhrase.length > 0 && !typedPhraseMatches ? "border-danger" : undefined
              }
              data-testid="destructive-typed-phrase"
            />
            {fieldErrors?.typedPhrase ? (
              <p role="alert" className="text-label text-danger">
                {fieldErrors.typedPhrase}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="destructive-reason">Reason</Label>
            <p id="destructive-reason-help" className="text-label text-fg-muted -mt-0.5">
              At least 8 characters. Saved to the platform audit log alongside your account, the
              timestamp, and the bucket counts.
            </p>
            <Textarea
              id="destructive-reason"
              name="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              minLength={8}
              maxLength={2000}
              rows={3}
              aria-required="true"
              aria-describedby="destructive-reason-help"
              aria-invalid={Boolean(fieldErrors?.reason) || undefined}
              data-testid="destructive-reason"
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
              data-testid="destructive-error"
              className="border-danger/30 bg-danger-subtle text-body text-danger rounded-[var(--radius-control)] border p-3"
            >
              {generalError}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={pending}
              data-testid="destructive-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!canSubmit}
              aria-busy={pending || undefined}
              data-testid="destructive-submit"
            >
              {pending ? (
                "Resetting…"
              ) : (
                <>
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Reset idea
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
