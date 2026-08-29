"use client";

import * as React from "react";
import {
  History,
  LayoutDashboard,
  MessageCircle,
  Pencil,
  Send,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * WorkspaceTabs — the in-page tab strip for the content detail
 * page. Reduces vertical page length by grouping the body into
 * four task-oriented views:
 *
 *   Overview   — at-a-glance: brief, schedule, channels, readiness
 *   Content    — caption, creative brief, format fields, AI
 *   Publishing — per-channel setup, live preview, readiness, approval
 *   Activity   — lifecycle events + delivery history
 *
 * The strip is a sticky anchor tab nav (the same shape as the
 * Brand Kit WorkspaceTopTabs, simplified for non-icon usage).
 * Each tab is an `<a href="#section">` so deep links, middle-
 * click, and screen-reader rotor all work natively. The active
 * state is recomputed on scroll using a rAF-throttled listener.
 *
 * Accessibility:
 *   - The strip is a `<nav aria-label>`.
 *   - Active tab carries `aria-current="true"`.
 *   - The labels are always rendered (no icon-only tabs).
 *   - Touch targets are 44px on small viewports.
 */

export type WorkspaceTabId = "overview" | "content" | "publishing" | "activity";

export interface WorkspaceTab {
  id: WorkspaceTabId;
  label: string;
  count?: number;
  icon: LucideIcon;
}

export const WORKSPACE_TAB_ICONS: Record<WorkspaceTabId, LucideIcon> = {
  overview: LayoutDashboard,
  content: Pencil,
  publishing: Send,
  activity: History,
};

export interface WorkspaceTabsProps {
  /** Tab order. Tabs are rendered in the order they are passed. */
  tabs: WorkspaceTab[];
  ariaLabel: string;
  /** Optional callback fired when the user changes tabs. */
  onChange?: (id: WorkspaceTabId) => void;
  className?: string;
}

function initialActiveId(tabs: WorkspaceTab[]): WorkspaceTabId {
  if (typeof window === "undefined") return tabs[0]?.id ?? "overview";
  const hash = window.location.hash.replace(/^#/, "");
  if (hash && tabs.some((t) => t.id === hash)) return hash as WorkspaceTabId;
  return tabs[0]?.id ?? "overview";
}

export function WorkspaceTabs({ tabs, ariaLabel, onChange, className }: WorkspaceTabsProps) {
  const [activeId, setActiveId] = React.useState<WorkspaceTabId>(() => initialActiveId(tabs));

  // Hash sync — back/forward navigation and deep links.
  React.useEffect(() => {
    function onHashChange() {
      const next = window.location.hash.replace(/^#/, "") as WorkspaceTabId;
      if (next && tabs.some((t) => t.id === next)) {
        setActiveId(next);
        onChange?.(next);
      }
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [tabs, onChange]);

  // Scroll spy — mark the tab whose section is nearest the top of
  // the viewport as active. Uses a rAF-throttled scroll handler
  // to avoid layout thrash; the trigger is 30% of the viewport
  // height so the active state flips just before the user sees
  // the next section header.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const sections = tabs
      .map((t) => document.getElementById(t.id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    let rafId: number | null = null;
    function onScroll() {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        const triggerY = window.innerHeight * 0.3;
        let current: WorkspaceTabId | null = null;
        for (const section of sections) {
          const rect = section.getBoundingClientRect();
          if (rect.top - triggerY <= 0) {
            current = section.id as WorkspaceTabId;
          } else {
            break;
          }
        }
        if (current && current !== activeId) {
          setActiveId(current);
          onChange?.(current);
        }
      });
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [tabs, activeId, onChange]);

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
          const Icon = tab.icon;
          const isActive = tab.id === activeId;
          return (
            <li key={tab.id} className="shrink-0">
              <a
                href={`#${tab.id}`}
                aria-current={isActive ? "true" : undefined}
                data-testid={`workspace-tab-${tab.id}`}
                data-active={isActive || undefined}
                onClick={() => {
                  setActiveId(tab.id);
                  onChange?.(tab.id);
                }}
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
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
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
