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
import { useLocaleT } from "@/components/i18n/locale-provider";

/**
 * WorkspaceTabs — the in-page tab strip for the content detail
 * page. Reduces vertical page length by grouping the body into
 * four task-oriented views:
 *
 *   Overview   — at-a-glance: brief, schedule, channels, readiness
 *   Create     — brief, creative fields, production, and delivery
 *   Publish    — copy, destinations, previews, readiness, and publishing
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

export type WorkspaceTabId = "overview" | "create" | "publish" | "activity";
export type LegacyWorkspacePanelId =
  | "overview"
  | "content"
  | "copy"
  | "delivery"
  | "preview"
  | "publishing"
  | "activity"
  | "create-basics"
  | "publish-settings";
export type WorkspacePanelId = WorkspaceTabId | LegacyWorkspacePanelId;
export type WorkspaceTabHash =
  WorkspaceTabId | LegacyWorkspacePanelId | "messages" | "assets-versions" | "workflow";

/**
 * The task workspace has four destinations. Legacy panel ids remain internal
 * so existing deep links and saved browser history continue to resolve.
 */
export const PRIMARY_WORKSPACE_TAB_IDS = [
  "overview",
  "create",
  "publish",
  "activity",
] as const satisfies readonly WorkspaceTabId[];

export const SECONDARY_WORKSPACE_TAB_IDS = [] as const satisfies readonly WorkspaceTabId[];

/** `#messages` was public in shared links; keep it as a read-compatible alias. */
export function normalizeWorkspaceTabId(value: string): WorkspaceTabId | null {
  // These aliases are kept for old bookmarks, readiness links, and shared
  // review URLs. They resolve to the new canonical workspace owner.
  if (["content", "delivery", "assets-versions"].includes(value)) return "create";
  if (["copy", "preview", "publishing", "messages"].includes(value)) return "publish";
  if (value === "workflow") return "overview";
  return ["overview", "create", "publish", "activity"].includes(value)
    ? (value as WorkspaceTabId)
    : null;
}

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
  /** Localized explanation for a numeric badge, announced with the tab label. */
  countLabel?: string;
}

export const WORKSPACE_TAB_ICONS: Record<WorkspaceTabId, LucideIcon> = {
  overview: LayoutDashboard,
  create: Pencil,
  publish: Send,
  activity: History,
};

export interface WorkspaceTabsProps {
  /** Tab order. Tabs are rendered in the order they are passed. */
  tabs: WorkspaceTab[];
  /** Optional direct secondary actions, such as Preview. */
  secondaryTabs?: WorkspaceTab[];
  ariaLabel: string;
  /** Controlled active id. Required — the parent owns the state. */
  value: WorkspaceTabId;
  /** Called when the user picks a different tab. */
  onValueChange: (id: WorkspaceTabId) => void;
  className?: string;
}

export function WorkspaceTabs({
  tabs,
  secondaryTabs,
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
        "border-border bg-surface sticky top-14 z-10 max-w-full min-w-0 rounded-t-[var(--radius-card)] border backdrop-blur-sm",
        className,
      )}
    >
      <label className="sr-only" htmlFor="workspace-stage-select">
        {ariaLabel}
      </label>
      <select
        id="workspace-stage-select"
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onValueChange(event.target.value as WorkspaceTabId)}
        className="border-border bg-surface text-fg-primary text-body focus-visible:ring-focus-ring min-h-11 w-full rounded-[var(--radius-control)] border px-3 py-2 md:hidden"
        data-testid="workspace-tab-select"
      >
        {tabs.map((tab) => (
          <option key={tab.id} value={tab.id}>
            {tab.label}
            {tab.countLabel
              ? ` — ${tab.countLabel}`
              : typeof tab.count === "number"
                ? ` (${tab.count})`
                : ""}
          </option>
        ))}
      </select>
      <div className="flex min-w-0 items-stretch gap-1">
        <ul
          className={cn(
            "flex flex-nowrap items-stretch gap-1 overflow-x-auto overscroll-x-contain",
            secondaryTabs ? "hidden md:flex" : "flex",
          )}
          role="list"
        >
          {tabs.map((tab) => {
            const Icon = WORKSPACE_TAB_ICONS[tab.id];
            const isActive = tab.id === value;
            return (
              <li key={tab.id} className="shrink-0">
                <button
                  type="button"
                  aria-current={isActive ? "true" : undefined}
                  aria-label={tab.countLabel ?? tab.label}
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
        {secondaryTabs?.map((tab) => {
          const Icon = WORKSPACE_TAB_ICONS[tab.id];
          const isActive = tab.id === value;
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={isActive ? "true" : undefined}
              aria-label={tab.countLabel ?? tab.label}
              data-testid={`workspace-secondary-tab-${tab.id}`}
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
                <span className="text-label bg-surface-subtle rounded-full px-1.5 py-0.5 font-mono tabular-nums">
                  {tab.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * WorkspacePanels — state-driven content area for the workspace
 * tabs. Content and Copy remain mounted while hidden so an
 * in-progress draft survives tab changes. Other panels remain
 * lazy and unmount when inactive. The parent (`WorkspaceShell`) owns the
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
 * Content and Copy are intentionally persistent mounts; the other
 * panels remain lazy and unmount when inactive. This keeps an in-progress
 * draft safe while still avoiding the cost of mounting every panel at once.
 */
export interface WorkspacePanelsProps {
  /** Map of tab id → panel body. Missing keys render nothing
   *  (defensive against server-side render races). */
  panels: Partial<Record<WorkspacePanelId, React.ReactNode>>;
  /** Active tab id; the matching panel is the only one rendered. */
  value: WorkspaceTabId;
}

export function WorkspacePanels({ panels, value }: WorkspacePanelsProps) {
  const panelGroups: Record<WorkspaceTabId, readonly WorkspacePanelId[]> = {
    overview: ["overview"],
    create: ["create-basics", "content", "delivery"],
    // Keep the publishing composer next to its preview. The preview panel
    // itself is supplied as a slot by the publishing surface below.
    publish: ["publish-settings", "publishing", "copy"],
    activity: ["activity"],
  };
  const visiblePanels = new Set(panelGroups[value]);
  const persistent = new Set<WorkspacePanelId>([
    "create-basics",
    "content",
    "delivery",
    "publish-settings",
    "copy",
    // Keep the preview mounted for the cross-tab continuity contract. The
    // active Publish surface receives the same preview through its slot.
    "preview",
    "publishing",
  ]);
  return (
    <>
      {Object.entries(panels).map(([id, panel]) => {
        if (!panel) return null;
        const panelId = id as WorkspacePanelId;
        const visible = visiblePanels.has(panelId);
        if (!visible && !persistent.has(panelId)) return null;
        return (
          <div key={panelId} hidden={!visible} aria-hidden={!visible}>
            {panel}
          </div>
        );
      })}
    </>
  );
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
  const hash = normalizeWorkspaceTabId(window.location.hash.replace(/^#/, ""));
  if (hash && tabs.some((t) => t.id === hash)) return hash;
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
  const t = useLocaleT();
  const tr = (key: string, fallback: string, params?: Record<string, string | number>) => {
    const result = t(key, params);
    return result === key
      ? fallback.replace(/\{(\w+)\}/g, (_, name) => String(params?.[name] ?? `{${name}}`))
      : result;
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-body border-border bg-surface text-fg-primary inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] border px-2.5 py-1 font-semibold",
        "hover:bg-surface-subtle focus-visible:ring-focus-ring focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none",
      )}
      aria-label={tr("contentDetail.comments.trigger.open", "Open discussion ({count} comments)", {
        count,
      })}
      data-testid="discussion-trigger"
    >
      <MessageCircle className="h-4 w-4" aria-hidden="true" />
      <span className="tabular-nums">{count}</span>
      {typeof mentionCount === "number" && mentionCount > 0 ? (
        <span
          className="text-label bg-primary-subtle text-primary rounded-full px-1.5 py-0.5 font-semibold"
          data-testid="discussion-trigger-mentions"
        >
          {tr(
            mentionCount === 1
              ? "contentDetail.comments.drawer.mentionForYouOne"
              : "contentDetail.comments.drawer.mentionForYouMany",
            mentionCount === 1 ? "1 mention for you" : "{count} mentions for you",
            { count: mentionCount },
          )}
        </span>
      ) : null}
    </button>
  );
}
