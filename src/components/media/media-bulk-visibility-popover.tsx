"use client";

import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { Eye } from "lucide-react";

/**
 * Bulk visibility popover. Plan §3.8 rule 4.
 */
export function MediaBulkVisibilityPopover({
  assetIds,
  onCompleted,
}: {
  assetIds: string[];
  onCompleted?: (updated: number, failures: Array<{ assetId: string; reason: string }>) => void;
}) {
  const t = useLocaleT();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function setVisibility(visibility: "workspace" | "agency") {
    setBusy(true);
    try {
      const response = await fetch("/api/media/assets/visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetIds, visibility }),
      });
      if (!response.ok) throw new Error("visibility failed");
      const payload = (await response.json()) as {
        updated: number;
        failures: Array<{ assetId: string; reason: string }>;
      };
      onCompleted?.(payload.updated, payload.failures);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={busy}>
          <Eye className="me-2 h-4 w-4" aria-hidden="true" />
          {t("media.bulk.visibility")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <div className="grid gap-2">
          <button
            type="button"
            onClick={() => setVisibility("workspace")}
            className="hover:bg-surface-subtle rounded-[var(--radius-control)] p-2 text-start"
          >
            <div className="text-label text-fg-primary font-semibold">
              {t("media.visibilityPicker.workspace")}
            </div>
            <div className="text-label text-fg-muted">
              {t("media.visibilityPicker.workspaceDescription")}
            </div>
          </button>
          <button
            type="button"
            onClick={() => setVisibility("agency")}
            className="hover:bg-surface-subtle rounded-[var(--radius-control)] p-2 text-start"
          >
            <div className="text-label text-fg-primary font-semibold">
              {t("media.visibilityPicker.agency")}
            </div>
            <div className="text-label text-fg-muted">
              {t("media.visibilityPicker.agencyDescription")}
            </div>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
