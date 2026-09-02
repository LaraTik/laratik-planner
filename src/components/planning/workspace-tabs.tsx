"use client";

import * as React from "react";
import {
  Eye,
  History,
  LayoutDashboard,
  MessageCircle,
  MessageSquare,
  Pencil,
  Send,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * WorkspaceTabs — the in-page tab strip for the content detail
 * page. Reduces vertical page length by grouping the body into
 * five task-oriented views:
 *
 *   Overview   — at-a-glance: brief, schedule, channels, readiness
 *   Content    — caption, creative brief, format fields, AI
 *   Preview    — full-width platform simulator (Feed / Reel / Story /
 *                Carousel). The old "sticky 360px right rail" was
 *                the row's biggest UX smell per AGENTS.md §B;
 *                moving it to a dedicated tab gives the Content
 *                tab its editing width back.
 *   Publishing — per-channel setup, readiness, approval
 *   Activity   — lifecycle events + delivery history
 *
 * Phase 1 of the planning-detail refactor (2026-08-30) converted
 * the strip from a scroll-spy implementation (sections were all
 * rendered at once, the strip just highlighted the one in view)
 * to a state-driven panel switcher. The active tab is now the
 * authoritative state — clicking a tab switches the content area
 * via `WorkspacePanels`. URL hash deep-linking still works
 * (parent calls `setActiveId` after reading the initial hash).
 *
 * Accessibility:
 *   - The strip is a `<nav aria-label>`.
 *   - Active tab carries `aria-current="true"`.
 *   - The labels are always rendered (no icon-only tabs).
 *   - Touch targets are 44px on small viewports.
 */

export type WorkspaceTabId =
  "overview" | "content" | "messages" | "preview" | "publishing" | "activity";

/**
 * Serialisable tab descriptor passed from a Server Component
 * parent to the Client `WorkspaceTabs` component. The `icon`
 * is intentionally NOT on this type — React component
 * functions don't survive the RSC boundary, so the client
 * resolves the icon from `id` via `WORKSPACE_TAB_ICONS`.
 */
export interface WorkspaceTab {
  id: WorkspaceTabId;
  label: string;
  count?: number;
}

export const WORKSPACE_TAB_ICONS: Record<WorkspaceTabId, LucideIcon> = {
  overview: LayoutDashboard,
  content: Pencil,
  messages: MessageSquare,
  preview: Eye,
  publishing: Send,
  activity: History,
};

export interface WorkspaceTabsProps {
  /** Tab order. Tabs are rendered in the order they are passed. */
  tabs: WorkspaceTab[];
  ariaLabel: string;
  /** Controlled active id. Required — the parent owns the state. */
  value: WorkspaceTabId;
  /** Called when the user picks a different tab. */
  onValueChange: (id: WorkspaceTabId) => void;
  className?: string;
}

export function WorkspaceTabs({
  tabs,
  ariaLabel,
  value,
  onValueChange,
  className,
}: WorkspaceTabsProps) {
  return (
    <nav
      aria-label={ariaLabel}
      data-testid="workspace-tabs"
      className={cn(
        "border-border bg-surface sticky top-0 z-10 -mx-1 -mb-2 border-b backdrop-blur-sm",
        className,
      )}
    >
      <ul className="flex flex-wrap items-stretch gap-1 overflow-x-auto" role="list">
        {tabs.map((tab) => {
          const Icon = WORKSPACE_TAB_ICONS[tab.id];
          const isActive = tab.id === value;
          return (
            <li key={tab.id} className="shrink-0">
              <button
                type="button"
                aria-current={isActive ? "true" : undefined}
                data-testid={`workspace-tab-${tab.id}`}
                data-active={isActive || undefined}
                onClick={() => onValueChange(tab.id)}
                className={cn(
                  "text-body inline-flex min-h-11 items-center gap-2 border-b-2 px-3 py-2 font-semibold transition-colors",
                  "focus-visible:ring-focus-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                  isActive
                    ? "border-primary text-primary"
                    : "hover:text-fg-primary text-fg-secondary border-transparent",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{tab.label}</span>
                {typeof tab.count === "number" ? (
                  <span
                    className={cn(
                      "text-label rounded-full px-1.5 py-0.5 font-mono tabular-nums",
                      isActive
                        ? "bg-primary-subtle text-primary"
                        : "bg-surface-subtle text-fg-muted",
                    )}
                  >
                    {tab.count}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * WorkspacePanels — state-driven content area for the workspace
 * tabs. Renders ONLY the active panel's children (off-tab
 * content unmounts). The parent (`WorkspaceShell`) owns the
 * `activeId` state, the hash sync, and the `WorkspaceTabs`
 * strip; this component is the body.
 *
 * Why a `panels` record instead of `children`:
 *   - The mapping from tab to body is explicit at the call site,
 *     which prevents the "5th section appears in the page but
 *     not in the strip" bug the previous design had.
 *   - The page composes the panels declaratively; off-tab content
 *     never enters the React tree, so child effects (form state,
 *     refs) don't leak across tabs.
 *
 * Render mode: `forceMount` is NOT set — Radix TabsContent
 * unmounts on switch, which matches the spec's "clicking a tab
 * must switch the main content area rather than simply scrolling"
 * (planning-detail refactor §1, 2026-08-30). The previous
 * scroll-spy DOM was deleted as part of the same refactor.
 */
export interface WorkspacePanelsProps {
  /** Map of tab id → panel body. Missing keys render nothing
   *  (defensive against server-side render races). */
  panels: Partial<Record<WorkspaceTabId, React.ReactNode>>;
  /** Active tab id; the matching panel is the only one rendered. */
  value: WorkspaceTabId;
}

export function WorkspacePanels({ panels, value }: WorkspacePanelsProps) {
  return <>{panels[value] ?? null}</>;
}

/**
 * Resolve the initial active tab from the URL hash. Pure /
 * SSR-safe: returns the first tab id when called server-side.
 * The hash is intentionally read once at mount — the parent
 * keeps a `hashchange` listener for back/forward navigation.
 */
export function initialActiveTabFromHash(
  tabs: ReadonlyArray<{ id: WorkspaceTabId }>,
): WorkspaceTabId {
  if (typeof window === "undefined") return tabs[0]?.id ?? "overview";
  const hash = window.location.hash.replace(/^#/, "");
  if (hash && tabs.some((t) => t.id === hash)) return hash as WorkspaceTabId;
  return tabs[0]?.id ?? "overview";
}

/**
 * Discussion trigger pill — opens the right-side drawer. Renders
 * a compact `💬 N` button that the parent puts in the planning
 * header. The trigger is the single, discoverable comment
 * affordance; the full-width discussion card on the detail
 * page is gone.
 */
export function DiscussionTrigger({
  count,
  mentionCount,
  onClick,
}: {
  count: number;
  mentionCount?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-body border-border bg-surface text-fg-primary inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-control)] border px-2.5 py-1 font-semibold",
        "hover:bg-surface-subtle focus-visible:ring-focus-ring focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none",
      )}
      aria-label={`Open discussion (${count} comment${count === 1 ? "" : "s"})`}
      data-testid="discussion-trigger"
    >
      <MessageCircle className="h-4 w-4" aria-hidden="true" />
      <span className="tabular-nums">{count}</span>
      {typeof mentionCount === "number" && mentionCount > 0 ? (
        <span
          className="text-label bg-primary-subtle text-primary rounded-full px-1.5 py-0.5 font-semibold"
          data-testid="discussion-trigger-mentions"
        >
          {mentionCount} for you
        </span>
      ) : null}
    </button>
  );
}
