"use client";

import * as React from "react";
import { MoreHorizontal, Pencil, Archive, RotateCcw } from "lucide-react";
import { DestructiveConfirmDialog } from "@/components/forms/destructive-confirm-dialog";
import { DiscussionDrawer } from "@/components/planning/discussion-drawer";
import {
  DiscussionTrigger,
  WorkspacePanels,
  WorkspaceTabs,
  type WorkspaceTab,
  type WorkspaceTabId,
} from "@/components/planning/workspace-tabs";
import type { CommentRecord, CommentRoleFlags } from "@/components/comments/comment-item";
import type { ResetIdeaCounts } from "@/lib/content/reset-idea-shared";
import { useLocaleT } from "@/components/i18n/locale-provider";

/**
 * WorkspaceShell — the client-side shell that:
 *
 *   1. Owns the active-tab state (state-driven panels; replaced
 *      the previous scroll-spy DOM in phase 1 of the planning-
 *      detail refactor on 2026-08-30).
 *   2. Mirrors the active tab to the URL hash so deep links
 *      (`#content`, `#publishing`, …) keep working.
 *   3. Renders the `Overview | Content | Publishing | Activity`
 *      tab strip and the panel body for the active tab.
 *   4. Owns the open state for the right-side Discussion drawer.
 *   5. Renders the header overflow menu (operator actions like
 *      "Reset idea" + utilities like "Duplicate" / "Archive").
 *
 * The page is still a Server Component for all data fetching;
 * this wrapper only handles the interactive bits. The page
 * passes a `panels` record (one entry per `WorkspaceTabId`); the
 * shell mounts only the entry for the active tab.
 *
 * A11y:
 *   - The overflow menu is a real `<button>` driven menu
 *     (we use a native `<details>` for simplicity — no extra
 *     Radix dependency, the focus story is straightforward, and
 *     Escape / outside-click are handled by the browser).
 *   - The drawer traps focus via the Radix Dialog primitive
 *     in the parent (we re-use the same component).
 *   - Tab switches update `aria-current` on the strip and
 *     swap the panel; screen-reader rotor still works because
 *     the panel IDs match the hash route.
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
  /** Panel bodies, keyed by tab id. The shell renders only the
   *  active panel. Missing keys render nothing. */
  panels: Partial<Record<WorkspaceTabId, React.ReactNode>>;
  /** Operator-only reset action. */
  canResetIdea: boolean;
  resetCounts: ResetIdeaCounts;
  /** Total activity events (for the "Activity" tab badge). */
  activityCount: number;
  /** Total open / mentioning comment counts (for the trigger). */
  openCommentCount: number;
  mentionCount: number;
  /**
   * Bound translator from the parent planning detail page.
   * Threaded to the embedded `<DiscussionDrawer>` so the
   * discussion surface (drawer chrome + comment items +
   * composer + mention picker) renders in the active locale.
   * (The shell's own chrome — tab labels, the discussion
   * trigger, the overflow menu — stays English for now;
   * that work belongs to a dedicated shell/tabs commit.)
   */
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
  panels,
  canResetIdea,
  resetCounts,
  openCommentCount,
  mentionCount,
}: WorkspaceShellProps) {
  const t = useLocaleT();
  // Keep the first render identical on the server and client. The URL hash is
  // browser-only, so reading it in the state initializer causes hydration
  // mismatches for deep links such as `#publishing`. The first effect below
  // adopts the hash after hydration, before syncing it back to history.
  const [activeId, setActiveId] = React.useState<WorkspaceTabId>(() => tabs[0]?.id ?? "overview");
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [resetOpen, setResetOpen] = React.useState(false);

  // Adopt a deep-link hash after hydration. This is deliberately
  // separate from the URL-sync effect below: React Strict Mode may
  // replay effects before the state transition commits, and combining
  // the two effects can overwrite a valid `#publishing` hash with the
  // hydration fallback `#overview`.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace(/^#/, "") as WorkspaceTabId;
    if (hash && tabs.some((tab) => tab.id === hash) && hash !== activeId) {
      React.startTransition(() => setActiveId(hash));
    }
  }, [activeId, tabs]);

  // Sync the active tab to the URL hash so deep links and the
  // back/forward buttons keep working. During the initial hydration
  // handoff, leave a valid incoming hash untouched until the state
  // transition above has committed.
  const initialHashPendingRef = React.useRef(true);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const incomingHash = window.location.hash.replace(/^#/, "") as WorkspaceTabId;
    if (initialHashPendingRef.current) {
      if (
        incomingHash &&
        tabs.some((tab) => tab.id === incomingHash) &&
        incomingHash !== activeId
      ) {
        return;
      }
      initialHashPendingRef.current = false;
    }
    const target = `#${activeId}`;
    if (window.location.hash !== target) {
      window.history.pushState(null, "", target);
    }
  }, [activeId, tabs]);

  // Hash → state (back/forward button, manual hash edit).
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    function onHashChange() {
      const next = window.location.hash.replace(/^#/, "") as WorkspaceTabId;
      if (next && tabs.some((t) => t.id === next) && next !== activeId) {
        setActiveId(next);
      }
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [tabs, activeId]);

  return (
    <>
      <div className="border-border bg-surface sticky top-0 z-20 -mx-1 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border px-2 py-1.5 backdrop-blur-sm">
        <WorkspaceTabs
          tabs={tabs}
          ariaLabel="Content workspace sections"
          value={activeId}
          onValueChange={setActiveId}
          className="static border-b-0"
        />
        <div className="flex items-center gap-1.5 pe-1">
          <DiscussionTrigger
            count={openCommentCount}
            mentionCount={mentionCount}
            onClick={() => setDrawerOpen(true)}
          />
          {canResetIdea ? (
            <OverflowMenu onReset={() => setResetOpen(true)} contentItemId={contentItemId} t={t} />
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

      <WorkspacePanels panels={panels} value={activeId} />
    </>
  );
}

function OverflowMenu({
  onReset,
  t,
}: {
  onReset: () => void;
  contentItemId: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  // Native <details>/<summary> — accessible, no JS focus
  // management, closes on outside click via the standard browser
  // behaviour. The menu is intentionally small (operator-only
  // actions) and lives under `•••` in the header.
  return (
    <details className="relative" data-testid="workspace-overflow-menu">
      <summary
        className="border-border bg-surface text-fg-primary hover:bg-surface-subtle focus-visible:ring-focus-ring inline-flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-[var(--radius-control)] border focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none [&::-webkit-details-marker]:hidden"
        aria-label="More actions"
        data-testid="workspace-overflow-trigger"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </summary>
      <div
        className="border-border bg-surface absolute end-0 z-30 mt-1 w-56 rounded-[var(--radius-control)] border p-1 shadow-lg"
        role="menu"
        data-testid="workspace-overflow-content"
      >
        <button
          type="button"
          disabled
          className="text-body text-fg-muted flex w-full cursor-not-allowed items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-start"
          title={t("planning.comingSoon")}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Duplicate
        </button>
        <button
          type="button"
          disabled
          className="text-body text-fg-muted flex w-full cursor-not-allowed items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-start"
          title={t("planning.comingSoon")}
        >
          <Archive className="h-3.5 w-3.5" aria-hidden="true" />
          Archive
        </button>
        <hr className="border-border my-1" />
        <button
          type="button"
          onClick={onReset}
          className="text-body text-danger hover:bg-danger-subtle focus-visible:ring-focus-ring flex w-full items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-start focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
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
