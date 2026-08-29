"use client";

import * as React from "react";
import { MoreHorizontal, Pencil, Archive, RotateCcw } from "lucide-react";
import { DestructiveConfirmDialog } from "@/components/forms/destructive-confirm-dialog";
import { DiscussionDrawer } from "@/components/planning/discussion-drawer";
import {
  DiscussionTrigger,
  WorkspaceTabs,
  type WorkspaceTab,
} from "@/components/planning/workspace-tabs";
import type { CommentRecord, CommentRoleFlags } from "@/components/comments/comment-item";
import type { ResetIdeaCounts } from "@/lib/content/reset-idea";

/**
 * WorkspaceShell — the client-side shell that:
 *
 *   1. Owns the open state for the right-side Discussion drawer.
 *   2. Renders the `Overview | Content | Publishing | Activity` tab strip.
 *   3. Renders the header overflow menu (operator actions like
 *      "Reset idea" + utilities like "Duplicate" / "Archive").
 *
 * The page is still a Server Component for all data fetching;
 * this wrapper only handles the interactive bits.
 *
 * A11y:
 *   - The overflow menu is a real `<button>` driven menu
 *     (we use a native `<details>` for simplicity — no extra
 *     Radix dependency, the focus story is straightforward, and
 *     Escape / outside-click are handled by the browser).
 *   - The drawer traps focus via the Radix Dialog primitive
 *     in the parent (we re-use the same component).
 */
export interface WorkspaceShellProps {
  workspaceSlug: string;
  contentItemId: string;
  ideaTitle: string;
  comments: CommentRecord[];
  currentUserId: string;
  roles: CommentRoleFlags;
  canPostInternal: boolean;
  canPostClientVisible: boolean;
  /** Optional tabs (server-computed counts) — at least the four
   *  defaults are always present. */
  tabs: WorkspaceTab[];
  /** Operator-only reset action. */
  canResetIdea: boolean;
  resetCounts: ResetIdeaCounts;
  /** Total activity events (for the "Activity" tab badge). */
  activityCount: number;
  /** Total open / mentioning comment counts (for the trigger). */
  openCommentCount: number;
  mentionCount: number;
  children: React.ReactNode;
}

export function WorkspaceShell({
  workspaceSlug,
  contentItemId,
  ideaTitle,
  comments,
  currentUserId,
  roles,
  canPostInternal,
  canPostClientVisible,
  tabs,
  canResetIdea,
  resetCounts,
  openCommentCount,
  mentionCount,
  children,
}: WorkspaceShellProps) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [resetOpen, setResetOpen] = React.useState(false);

  return (
    <>
      <div className="border-border bg-surface sticky top-0 z-20 -mx-1 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border px-2 py-1.5 backdrop-blur-sm">
        <WorkspaceTabs
          tabs={tabs}
          ariaLabel="Content workspace sections"
          className="static border-b-0"
        />
        <div className="flex items-center gap-1.5 pr-1">
          <DiscussionTrigger
            count={openCommentCount}
            mentionCount={mentionCount}
            onClick={() => setDrawerOpen(true)}
          />
          {canResetIdea ? (
            <OverflowMenu onReset={() => setResetOpen(true)} contentItemId={contentItemId} />
          ) : null}
        </div>
      </div>

      <DiscussionDrawer
        workspaceSlug={workspaceSlug}
        contentItemId={contentItemId}
        comments={comments}
        currentUserId={currentUserId}
        roles={roles}
        canPostInternal={canPostInternal}
        canPostClientVisible={canPostClientVisible}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />

      {canResetIdea ? (
        <DestructiveConfirmDialog
          open={resetOpen}
          onOpenChange={setResetOpen}
          workspaceSlug={workspaceSlug}
          contentItemId={contentItemId}
          ideaTitle={ideaTitle}
          counts={resetCounts}
        />
      ) : null}

      {children}
    </>
  );
}

function OverflowMenu({ onReset }: { onReset: () => void; contentItemId: string }) {
  // Native <details>/<summary> — accessible, no JS focus
  // management, closes on outside click via the standard browser
  // behaviour. The menu is intentionally small (operator-only
  // actions) and lives under `•••` in the header.
  return (
    <details className="relative" data-testid="workspace-overflow-menu">
      <summary
        className="border-border bg-surface text-fg-primary hover:bg-surface-subtle focus-visible:ring-focus-ring inline-flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-[var(--radius-control)] border focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none [&::-webkit-details-marker]:hidden"
        aria-label="More actions"
        data-testid="workspace-overflow-trigger"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </summary>
      <div
        className="border-border bg-surface absolute right-0 z-30 mt-1 w-56 rounded-[var(--radius-control)] border p-1 shadow-lg"
        role="menu"
        data-testid="workspace-overflow-content"
      >
        <button
          type="button"
          disabled
          className="text-body text-fg-muted flex w-full cursor-not-allowed items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-left"
          title="Coming soon"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Duplicate
        </button>
        <button
          type="button"
          disabled
          className="text-body text-fg-muted flex w-full cursor-not-allowed items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-left"
          title="Coming soon"
        >
          <Archive className="h-3.5 w-3.5" aria-hidden="true" />
          Archive
        </button>
        <hr className="border-border my-1" />
        <button
          type="button"
          onClick={onReset}
          className="text-body text-danger hover:bg-danger-subtle focus-visible:ring-focus-ring flex w-full items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-left focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
          role="menuitem"
          data-testid="workspace-overflow-reset"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Reset content
        </button>
      </div>
    </details>
  );
}
