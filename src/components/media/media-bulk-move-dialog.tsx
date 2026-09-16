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
import type { MediaFolderTreeRow } from "@/lib/media/service";

/**
 * Bulk-move dialog. Plan §3.8 rule 4.
 *
 * Lets the user pick a destination folder (system + user folders from
 * the same tree the sidebar uses) and submits
 * `POST /api/media/assets/move`. Idempotent on the server.
 */
export function MediaBulkMoveDialog({
  open,
  onOpenChange,
  assetIds,
  folders,
  onCompleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetIds: string[];
  folders: MediaFolderTreeRow[];
  onCompleted?: (moved: number, failures: Array<{ assetId: string; reason: string }>) => void;
}) {
  const t = useLocaleT();
  const [destination, setDestination] = React.useState<string>("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const byParent = React.useMemo(() => {
    const map = new Map<string | null, MediaFolderTreeRow[]>();
    for (const folder of folders) {
      const key = folder.parentId ?? null;
      map.set(key, [...(map.get(key) ?? []), folder]);
    }
    return map;
  }, [folders]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/media/assets/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetIds,
          folderId: destination === "" ? null : destination,
        }),
      });
      if (!response.ok) throw new Error("move failed");
      const payload = (await response.json()) as {
        moved: number;
        failures: Array<{ assetId: string; reason: string }>;
      };
      onCompleted?.(payload.moved, payload.failures);
      onOpenChange(false);
    } catch {
      setError("move_failed");
    } finally {
      setBusy(false);
    }
  }

  const renderOptions = (parentId: string | null, depth: number): React.ReactElement[] => {
    const children = byParent.get(parentId) ?? [];
    return children.flatMap((folder) => [
      <option key={folder.id} value={folder.id}>
        {"— ".repeat(depth)}
        {folder.name}
      </option>,
      ...renderOptions(folder.id, depth + 1),
    ]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeAriaLabel="Close">
        <DialogHeader>
          <DialogTitle>{t("media.confirmMove.title", { count: assetIds.length })}</DialogTitle>
          <DialogDescription>{t("media.confirmMove.body")}</DialogDescription>
        </DialogHeader>
        <label className="text-label text-fg-primary font-semibold">
          {t("media.confirmMove.pickFolder")}
          <select
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring mt-1 min-h-11 w-full rounded-[var(--radius-control)] border px-2 focus-visible:ring-2 focus-visible:outline-none"
          >
            <option value="">{t("media.confirmMove.currentFolder", { folder: "Unfiled" })}</option>
            {renderOptions(null, 0)}
          </select>
        </label>
        {error ? (
          <p className="text-label text-danger" role="alert">
            {t("media.moveError")}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("media.confirmMove.cancel")}
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? t("media.bulk.loading") : t("media.confirmMove.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
