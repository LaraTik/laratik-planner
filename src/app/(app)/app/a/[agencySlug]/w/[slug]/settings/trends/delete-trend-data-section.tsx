"use client";

import * as React from "react";
import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeleteTrendDataConfirmDialog } from "@/components/forms/delete-trend-data-confirm-dialog";
import { useLocaleT } from "@/components/i18n/locale-provider";

/**
 * "Delete my trend data" danger zone section.
 *
 * Lives on the workspace settings page (in a new "trends" subsection)
 * so the operator can find it from the workspace context they're
 * already triaging. Same `border-danger/30 bg-danger-subtle` treatment
 * as the per-idea / bulk-reset danger zones; the page itself
 * remains one card for the normal form, and the trend danger zone
 * is a separate section underneath.
 */
export function DeleteTrendDataSection({
  workspaceSlug,
  workspaceName,
  counts,
}: {
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
}) {
  const t = useLocaleT();
  const [open, setOpen] = React.useState(false);
  const totalSignals = counts?.trendSignals ?? 0;
  return (
    <section
      data-testid="delete-trend-data-section"
      className="border-danger/30 bg-danger-subtle rounded-[var(--radius-control)] border p-4"
    >
      <div className="text-danger mb-2 flex items-center gap-2">
        <ShieldOff className="h-5 w-5" aria-hidden="true" />
        <h2 className="text-title-card text-fg-primary font-semibold">
          {t("trends.deleteData.title") || "Delete my trend data"}
        </h2>
      </div>
      <p className="text-body text-fg-secondary mb-3 max-w-3xl">
        {t("trends.deleteData.blurb") ||
          "GDPR delete. Permanently delete every trend signal, board, brief, and feedback event for this workspace. Source enablement and audit logs are preserved."}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="destructive"
          size="lg"
          onClick={() => setOpen(true)}
          data-testid="delete-trend-data-trigger"
        >
          {t("trends.deleteData.submit") || "Delete my trend data"}
        </Button>
        {totalSignals > 0 ? (
          <p className="text-label text-fg-muted max-w-md">
            {t("trends.deleteData.ideaCount", { count: totalSignals }) ||
              `${totalSignals} trend signals will be deleted`}
          </p>
        ) : null}
      </div>
      <DeleteTrendDataConfirmDialog
        open={open}
        onOpenChange={setOpen}
        workspaceSlug={workspaceSlug}
        workspaceName={workspaceName}
        {...(counts ? { counts } : {})}
      />
    </section>
  );
}
