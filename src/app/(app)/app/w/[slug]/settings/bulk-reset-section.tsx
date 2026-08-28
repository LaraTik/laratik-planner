"use client";

import * as React from "react";
import { AlertOctagon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BulkResetConfirmDialog } from "@/components/forms/bulk-reset-confirm-dialog";
import type { ResetAllIdeasCounts } from "@/lib/content/reset-all-ideas";

/**
 * Bulk "Reset all ideas" Danger zone section.
 *
 * Companion to the per-idea `ResetIdeaSection` on the content
 * detail page. Lives on the workspace settings page so the
 * operator can find it from the workspace context they're
 * already triaging. Same `border-danger/30 bg-danger-subtle`
 * treatment as the per-idea section; the page itself remains
 * one card for the normal form, and the bulk danger zone is
 * a separate section underneath.
 */
export function BulkResetSection({
  workspaceSlug,
  workspaceName,
  counts,
}: {
  workspaceSlug: string;
  workspaceName: string;
  counts: ResetAllIdeasCounts;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <section
      data-testid="bulk-reset-section"
      className="border-danger/30 bg-danger-subtle rounded-[var(--radius-control)] border p-4"
    >
      <div className="text-danger mb-2 flex items-center gap-2">
        <AlertOctagon className="h-5 w-5" aria-hidden="true" />
        <h2 className="text-title-card text-fg-primary font-semibold">Bulk reset</h2>
      </div>
      <p className="text-body text-fg-secondary mb-3 max-w-3xl">
        Hard-deletes every idea in this workspace (and all 8 cascade children per idea). The 3
        set-null tables (attachments, AI usage, activity) keep their rows with the link cleared. By
        default, live published ideas are skipped — the confirm dialog has an opt-in toggle for the
        dangerous case.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="destructive"
          size="lg"
          onClick={() => setOpen(true)}
          data-testid="bulk-reset-trigger"
        >
          Reset all ideas
        </Button>
        <p className="text-label text-fg-muted max-w-md">
          Currently {counts.totalAllIdeas} idea{counts.totalAllIdeas === 1 ? "" : "s"} in this
          workspace, {counts.totalLive} of which are live (published or partially-published).
        </p>
      </div>
      <BulkResetConfirmDialog
        open={open}
        onOpenChange={setOpen}
        workspaceSlug={workspaceSlug}
        workspaceName={workspaceName}
        counts={counts}
      />
    </section>
  );
}
