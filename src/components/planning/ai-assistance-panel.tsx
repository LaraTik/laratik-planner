"use client";

import * as React from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { AiAssistanceSection } from "@/app/(app)/app/w/[slug]/planning/[id]/ai-assistance-section";

/**
 * AiAssistancePanel — a contextual launcher for the broad
 * AI capabilities (Campaign ideas, Improve brief, Adapt to
 * platform, Related format ideas, Check completeness).
 *
 * The previous design rendered the full AI capability surface
 * inline as a large card at the bottom of the Content tab,
 * which dominated the editing experience. Per the §10 / §33
 * guidance, broad AI actions belong in a panel that the user
 * opens on demand, not in the primary editing flow.
 *
 * Per-field AI actions (Improve caption, Shorten, Adapt, …)
 * are still rendered inline next to the field they affect.
 * This launcher is the entry point for the workspace-level
 * capabilities that touch the brief as a whole.
 *
 * The launcher button lives in the Content section header
 * (a small `✨ AI` pill) so the planner can see it without
 * scrolling. The dialog content area is a vertical scroll
 * container — the panel can be very tall because the
 * underlying AiAssistanceSection has its own form and
 * variant preview.
 */
export interface AiAssistancePanelProps {
  workspaceSlug: string;
  contentItemId: string;
  contentStatus: string;
  isManager: boolean;
  isPlanner: boolean;
  enabledCapabilities: string[];
  agencyEnabled: boolean;
  hasKey: boolean;
  currentBrief: string;
  /** Optional class on the launcher button (e.g. to size it). */
  className?: string;
  /** Label for the launcher button. */
  triggerLabel?: string;
}

export function AiAssistancePanel({
  workspaceSlug,
  contentItemId,
  contentStatus,
  isManager,
  isPlanner,
  enabledCapabilities,
  agencyEnabled,
  hasKey,
  currentBrief,
  className,
  triggerLabel = "AI assistance",
}: AiAssistancePanelProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="ai-assistance-panel-trigger"
        className={cn("inline-flex items-center gap-1.5", className)}
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        {triggerLabel}
      </Button>
      <DialogContent
        className="max-h-[85vh] w-[min(720px,calc(100vw-2rem))] overflow-hidden p-0"
        data-testid="ai-assistance-panel-content"
      >
        <DialogHeader className="border-border border-b px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="text-primary h-4 w-4" aria-hidden="true" />
                AI assistance
              </DialogTitle>
              <DialogDescription>
                Generate drafts, improve the brief, and check completeness.
              </DialogDescription>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-fg-muted hover:text-fg-primary focus-visible:ring-focus-ring -me-1 -mt-1 inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] focus:outline-none focus-visible:ring-2"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </DialogHeader>
        <div className="max-h-[calc(85vh-4.5rem)] overflow-y-auto px-4 py-4">
          <AiAssistanceSection
            workspaceSlug={workspaceSlug}
            contentItemId={contentItemId}
            contentStatus={contentStatus}
            isManager={isManager}
            isPlanner={isPlanner}
            enabledCapabilities={enabledCapabilities}
            agencyEnabled={agencyEnabled}
            hasKey={hasKey}
            currentBrief={currentBrief}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
