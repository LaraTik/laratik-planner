"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLocaleT } from "@/components/i18n/locale-provider";

/**
 * Bulk-trash confirm dialog. Plan §3.8 rule 4.
 *
 * Submits `POST /api/media/assets/trash`; on success the parent shows
 * an undo toast for 5 s (handled by the bulk toolbar, plan §3.8 rule 4
 * → 5-second undo via `POST /api/media/assets/restore`).
 */
export function MediaBulkTrashDialog({
  open,
  onOpenChange,
  assetIds,
  onCompleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetIds: string[];
  onCompleted?: (trashed: number, failures: Array<{ assetId: string; reason: string }>) => void;
}) {
  const t = useLocaleT();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/media/assets/trash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetIds }),
      });
      if (!response.ok) throw new Error("trash failed");
      const payload = (await response.json()) as {
        trashed: number;
        failures: Array<{ assetId: string; reason: string }>;
      };
      onCompleted?.(payload.trashed, payload.failures);
      onOpenChange(false);
    } catch {
      setError("trash_failed");
    } finally {
      setBusy(false);
    }
  }

  const body =
    assetIds.length === 1
      ? t("media.confirmTrash.bodyOne")
      : t("media.confirmTrash.body", { count: assetIds.length });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeAriaLabel="Close">
        <DialogHeader>
          <DialogTitle>
            {assetIds.length === 1
              ? t("media.confirmTrash.title", { count: 1 })
              : t("media.confirmTrash.title", { count: assetIds.length })}
          </DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-label text-danger" role="alert">
            {t("media.manageError")}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("media.confirmTrash.cancel")}
          </Button>
          <Button variant="destructive" onClick={submit} disabled={busy}>
            {busy ? t("media.bulk.loading") : t("media.confirmTrash.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
