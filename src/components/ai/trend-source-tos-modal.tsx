"use client";

import * as React from "react";
import { TriangleAlert, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * ToS acknowledgement modal for grey-area trend sources.
 *
 * Appears when an agency admin tries to enable a source whose
 * `tos_class === "grey"`. The four sources that trigger it in v1
 * are: twikit, instaloader, tomquirk, kawsarlog (community-maintained
 * unofficial APIs for X, Instagram, and Threads respectively).
 *
 * The acknowledgement is sent to `POST /api/trends/sources/{key}/acknowledge-tos`
 * and recorded in `trend_source_audit` with `action=configure` and the
 * `acknowledged=true` metadata flag. A `tos_acknowledged_by` and
 * `tos_acknowledged_at` are written to the `trend_source` row.
 *
 * Privacy: the modal carries no PII. The server action's audit row
 * records the actor's user id (already a known quantity for the
 * audit log) plus the source key.
 */
export function TrendSourceTosModal({
  open,
  onOpenChange,
  sourceKey,
  sourceLabel,
  onAcknowledged,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  sourceKey: string;
  sourceLabel: string;
  /** Fires after the server has recorded the acknowledgement. */
  onAcknowledged?: () => void;
}) {
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleCancel = React.useCallback(() => {
    if (submitting) return;
    onOpenChange(false);
  }, [onOpenChange, submitting]);

  const handleConfirm = React.useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/trends/sources/${encodeURIComponent(sourceKey)}/acknowledge-tos`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      onAcknowledged?.();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record acknowledgement");
    } finally {
      setSubmitting(false);
    }
  }, [onAcknowledged, onOpenChange, sourceKey]);

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent data-testid="trend-source-tos-modal">
        <DialogHeader>
          <div className="text-warning flex items-center gap-2">
            <TriangleAlert className="h-5 w-5" aria-hidden="true" />
            <DialogTitle>⚠ This source uses an unofficial API</DialogTitle>
          </div>
          <DialogDescription>
            You are about to enable <strong>{sourceLabel}</strong> ({sourceKey}).
          </DialogDescription>
        </DialogHeader>

        <div
          className="border-warning/30 bg-warning-subtle text-fg-primary flex items-start gap-3 rounded-[var(--radius-control)] border p-3 text-sm leading-relaxed"
          data-testid="trend-source-tos-modal-body"
        >
          <ShieldAlert className="text-warning mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>
            This source uses an unofficial API that may violate the platform&apos;s Terms of
            Service. Your account may be restricted.{" "}
            <strong>
              laratik-planner is not responsible for consequences to your platform accounts.
            </strong>
          </p>
        </div>

        {error ? (
          <div
            className="border-danger/30 bg-danger-subtle text-danger flex items-start gap-2 rounded-[var(--radius-control)] border p-3 text-sm"
            data-testid="trend-source-tos-modal-error"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>{error}</p>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={handleCancel}
            disabled={submitting}
            data-testid="trend-source-tos-cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={submitting}
            data-testid="trend-source-tos-confirm"
          >
            {submitting ? "Recording…" : "I understand, enable anyway"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
