"use client";

import * as React from "react";
import { AlertOctagon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DestructiveConfirmDialog } from "@/components/forms/destructive-confirm-dialog";
import type { ResetIdeaCounts } from "@/lib/content/reset-idea";

/**
 * "Reset idea" Danger zone section.
 *
 * Visually mirrors the platform admin's archive boundary:
 * `border-danger/30 bg-danger-subtle` so the operator's eye lands
 * here only after a deliberate scroll past the normal content of
 * the page. Renders only for operators with the destructive
 * permission — the parent page gates on that server-side.
 */
export function ResetIdeaSection({
  workspaceSlug,
  contentItemId,
  ideaTitle,
  counts,
}: {
  workspaceSlug: string;
  contentItemId: string;
  ideaTitle: string;
  counts: ResetIdeaCounts;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <section
      data-testid="reset-idea-section"
      className="border-danger/30 bg-danger-subtle rounded-[var(--radius-control)] border p-4"
    >
      <div className="text-danger mb-2 flex items-center gap-2">
        <AlertOctagon className="h-5 w-5" aria-hidden="true" />
        <h2 className="text-title-card text-fg-primary font-semibold">Danger zone</h2>
      </div>
      <p className="text-body text-fg-secondary mb-3 max-w-3xl">
        The actions below are reserved for LaraTik platform operators and cannot be undone. Every
        destructive operation is recorded in the platform audit log with the operator, the reason,
        and the per-table counts of what was removed.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="destructive"
          size="lg"
          onClick={() => setOpen(true)}
          data-testid="reset-idea-trigger"
        >
          Reset idea
        </Button>
        <p className="text-label text-fg-muted max-w-md">
          Hard-deletes the idea and all 8 cascade children. The 3 set-null tables (attachments, AI
          usage, activity) keep their rows with the link cleared.
        </p>
      </div>
      <DestructiveConfirmDialog
        open={open}
        onOpenChange={setOpen}
        workspaceSlug={workspaceSlug}
        contentItemId={contentItemId}
        ideaTitle={ideaTitle}
        counts={counts}
      />
    </section>
  );
}
