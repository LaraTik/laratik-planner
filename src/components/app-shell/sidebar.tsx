"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import { isActivePath, cn } from "@/lib/utils";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { AgencySwitcher, type AgencyRow } from "./agency-switcher";
import { SidebarCollapseToggle } from "./sidebar-collapse-toggle";
import {
  buildAgencyNavigation,
  buildClientReviewerNavigation,
  buildWorkspaceNavigation,
  type IconComponent,
  type SidebarExpandableGroupSpec,
  type SidebarGroupSpec,
  type SidebarItemSpec,
  type SidebarLinkSpec,
  type SidebarNestedItemSpec,
} from "./navigation-model";
import type { PlatformNavigationAccess } from "@/lib/auth/platform-navigation-access";

/**
 * Primary navigation sidebar.
 *
 * Workspace-aware per the Stitch design (project 5403097764334458790).
 * The shape changes based on the current pathname:
 *
 *  - Inside /app/w/[slug]/* (workspace context):
 *      - Brand: logo + workspace switcher (at the top)
 *      - Workspace tabs (vertical): Overview, Content group, Performance,
 *        Brand group, Manage group (when admin)
 *      - Persistent bottom area: Create content + user menu
 *
 *  - On a global page (/app, /app/workspaces, /app/users, ...):
 *      - Brand: logo only
 *      - My Work
 *      - Workspaces
 *      - (admin only) User Management, Agency Settings
 *      - (platform admin only) Platform console
 *      - Bottom: agency switcher (if multi-agency) + user menu
 *
 *  - Inside a client-reviewer workspace:
 *      - Minimal: Client review + Calendar
 *
 * The active path uses `isActivePath` from `src/lib/utils.ts` so the
 * active-state predicate stays consistent across the shell.
 *
 * Width:
 *   - Expanded: 248px (xl+), 248px below if not collapsed
 *   - Collapsed: 64px (icon-rail, no labels)
 *   - Mobile:   hidden (MobileNav takes over)
 *
 * The collapsed state is persisted via a cookie (see
 * `src/lib/nav/sidebar-preference.ts`).
 */
export function Sidebar({
  user,
  workspaces,
  workspaceAccess = {},
  workspaceCanCreateContent = {},
  workspaceSwitcherOptions,
  agencySwitcher,
  canCreateWorkspace,
  platformAccess,
  workspaceBadgesByWorkspaceId = {},
  unreadAppErrors = 0,
  collapsed = false,
  onCollapsedChange,
}: {
  user: { name: string; isAdmin: boolean };
  workspaces: { id: string; slug: string; name: string }[];
  workspaceAccess?: Record<string, "internal" | "client" | "none">;
  workspaceCanCreateContent?: Record<string, boolean>;
  workspaceSwitcherOptions: { id: string; name: string; slug: string }[];
  agencySwitcher: { active: AgencyRow | null; options: AgencyRow[] };
  canCreateWorkspace: boolean;
  platformAccess: PlatformNavigationAccess;
  workspaceBadgesByWorkspaceId?: Record<string, { approvals: number; designQueue: number }>;
  unreadAppErrors?: number;
  collapsed?: boolean;
  onCollapsedChange?: ((next: boolean) => void) | undefined;
}) {
  const pathname = usePathname();

  // Detect workspace context from the URL. /app/w/[slug]/* means we
  // are inside a workspace; everything else under /app is global.
  const slugMatch = pathname.match(/^\/app\/w\/([^/]+)/);
  const currentWorkspace = slugMatch
    ? (workspaces.find((w) => w.slug === slugMatch[1]) ?? null)
    : null;
  const inWorkspace = currentWorkspace !== null;
  const wsBase = currentWorkspace ? `/app/w/${currentWorkspace.slug}` : "";
  const clientOnly = currentWorkspace ? workspaceAccess[currentWorkspace.id] === "client" : false;
  const canCreateContent = currentWorkspace
    ? workspaceCanCreateContent[currentWorkspace.id] === true
    : false;
  const planningActive = Boolean(
    currentWorkspace &&
    (isActivePath(`${wsBase}/planning`, pathname) ||
      isActivePath(`${wsBase}/board`, pathname) ||
      isActivePath(`${wsBase}/calendar`, pathname)),
  );
  // Subscribe to the URL hash so the Settings page highlights the
  // correct sub-anchor (Lifecycle / Lead times / etc).
  React.useSyncExternalStore(subscribeToHash, readHash, () => "");
  void React;

  // Build the navigation tree from the model. Each branch keeps the
  // build pure (no JSX) so the renderer is just dispatch.
  const agencyNav = !inWorkspace
    ? buildAgencyNavigation({ isAdmin: user.isAdmin, platformAccess, unreadAppErrors })
    : null;
  const clientNav =
    inWorkspace && currentWorkspace && clientOnly
      ? buildClientReviewerNavigation({ wsBase })
      : null;
  const workspaceNav =
    inWorkspace && currentWorkspace && !clientOnly
      ? buildWorkspaceNavigation({
          wsBase,
          badges: workspaceBadgesByWorkspaceId?.[currentWorkspace.id] ?? {
            approvals: 0,
            designQueue: 0,
          },
          canCreateContent,
          canManage: user.isAdmin || workspaceCanCreateContent[currentWorkspace.id] === true,
        })
      : null;
  const createContentHref = workspaceNav?.createContentHref ?? null;

  return (
    <nav className="flex h-full flex-col" aria-label="Primary" data-testid="app-sidebar">
      {/* Brand + workspace switcher (top) */}
      <SidebarHeader
        collapsed={collapsed}
        currentWorkspace={currentWorkspace}
        workspaceSwitcherOptions={workspaceSwitcherOptions}
        canCreateWorkspace={canCreateWorkspace}
        onCollapsedChange={onCollapsedChange}
      />

      {/* Top section: workspace tabs OR global items */}
      <div className="flex-1 space-y-1 overflow-y-auto px-2 xl:px-3">
        {workspaceNav ? (
          <WorkspaceNavTree
            top={workspaceNav.top}
            groups={workspaceNav.groups}
            pathname={pathname}
            planningActive={planningActive}
            collapsed={collapsed}
          />
        ) : clientNav ? (
          <ClientNavTree top={clientNav.top} pathname={pathname} />
        ) : agencyNav ? (
          <AgencyNavTree
            top={agencyNav.top}
            groups={agencyNav.groups}
            pathname={pathname}
            agencySwitcher={agencySwitcher}
            platformAccess={platformAccess}
            collapsed={collapsed}
            onCollapsedChange={onCollapsedChange}
          />
        ) : null}
      </div>

      {/* Bottom section: actions + meta + switcher */}
      <SidebarFooter
        collapsed={collapsed}
        inWorkspace={Boolean(inWorkspace)}
        createContentHref={createContentHref}
        workspaceSwitcherOptions={workspaceSwitcherOptions}
        currentWorkspace={currentWorkspace}
        canCreateWorkspace={canCreateWorkspace}
        agencySwitcher={agencySwitcher}
        platformAccess={platformAccess}
      />
    </nav>
  );
}

// ─── Sub-views ─────────────────────────────────────────────────────────────

function SidebarHeader({
  collapsed,
  currentWorkspace,
  workspaceSwitcherOptions,
  canCreateWorkspace,
  onCollapsedChange,
}: {
  collapsed: boolean;
  currentWorkspace: { id: string; name: string; slug: string } | null;
  workspaceSwitcherOptions: { id: string; name: string; slug: string }[];
  canCreateWorkspace: boolean;
  onCollapsedChange?: ((next: boolean) => void) | undefined;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 pt-2 pb-2 xl:px-3",
        collapsed ? "justify-center" : "justify-between",
      )}
    >
      <Link
        href="/app"
        className={cn(
          "focus-visible:ring-focus-ring flex items-center gap-2 rounded-[var(--radius-control)] focus:outline-none focus-visible:ring-2",
          collapsed ? "justify-center" : "flex-1",
        )}
        aria-label="StudioFlow home"
        title="StudioFlow"
      >
        <div className="bg-primary flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] font-bold text-white">
          S
        </div>
        {!collapsed ? (
          <div className="min-w-0">
            <p className="text-section-title text-fg-primary truncate font-semibold">StudioFlow</p>
          </div>
        ) : null}
      </Link>
      {!collapsed && currentWorkspace ? (
        <WorkspaceSwitcher
          active={currentWorkspace}
          options={workspaceSwitcherOptions}
          canCreate={canCreateWorkspace}
          compact
          testId="sidebar-workspace-switcher-trigger"
        />
      ) : null}
      {!collapsed && onCollapsedChange ? (
        <SidebarCollapseToggle collapsed={collapsed} variant="header" />
      ) : null}
    </div>
  );
}

function SidebarFooter({
  collapsed,
  inWorkspace,
  createContentHref,
  workspaceSwitcherOptions,
  currentWorkspace,
  canCreateWorkspace,
  agencySwitcher,
  platformAccess,
}: {
  collapsed: boolean;
  inWorkspace: boolean;
  createContentHref: string | null;
  workspaceSwitcherOptions: { id: string; name: string; slug: string }[];
  currentWorkspace: { id: string; name: string; slug: string } | null;
  canCreateWorkspace: boolean;
  agencySwitcher: { active: AgencyRow | null; options: AgencyRow[] };
  platformAccess: PlatformNavigationAccess;
}) {
  return (
    <div className="border-border mt-auto space-y-1 border-t p-2 xl:p-3">
      {inWorkspace && createContentHref ? (
        <Link
          href={createContentHref}
          className={cn(
            "bg-primary hover:bg-primary-hover text-button flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] px-3 py-2 font-semibold text-white transition-colors",
            collapsed ? "" : "",
          )}
          aria-label="Create content"
          title="Create content"
          data-testid="sidebar-create-content"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span className="hidden xl:inline">Create content</span>
        </Link>
      ) : null}

      {/* Global mode: agency switcher + workspace switcher in footer.
          The workspace switcher is reachable from the top header
          when in a workspace, so it stays in the footer only when
          we're on a global route. */}
      {!inWorkspace ? (
        <>
          {agencySwitcher.options.length > 1 || platformAccess.canEnter ? (
            <div className="pt-1">
              <AgencySwitcher
                active={agencySwitcher.active}
                options={agencySwitcher.options}
                isPlatformAdmin={platformAccess.canEnter}
                compact
                testId="sidebar-agency-switcher-trigger"
              />
            </div>
          ) : null}

          <div className="pt-1">
            {workspaceSwitcherOptions.length === 0 ? (
              <Link
                href="/app/workspaces/new"
                className="text-body text-fg-secondary hover:bg-surface-subtle focus-visible:ring-focus-ring inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-dashed px-3 py-2 font-semibold focus:outline-none focus-visible:ring-2"
                data-testid="sidebar-workspace-empty"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create your first workspace
              </Link>
            ) : (
              <WorkspaceSwitcher
                active={currentWorkspace ?? workspaceSwitcherOptions[0] ?? null}
                options={workspaceSwitcherOptions}
                canCreate={canCreateWorkspace}
                compact
                testId="sidebar-workspace-switcher-trigger"
              />
            )}
          </div>
        </>
      ) : null}

      {/* Footer toggle (only visible when collapsed — header toggle covers expanded). */}
      {collapsed ? (
        <div className="flex justify-center pt-1">
          <SidebarCollapseToggle collapsed={collapsed} variant="footer" />
        </div>
      ) : null}
    </div>
  );
}

// ─── Nav tree renderers ────────────────────────────────────────────────────

function WorkspaceNavTree({
  top,
  groups,
  pathname,
  planningActive,
  collapsed,
}: {
  top: SidebarLinkSpec[];
  groups: SidebarGroupSpec[];
  pathname: string;
  planningActive: boolean;
  collapsed: boolean;
}) {
  return (
    <div className="space-y-1">
      {top.map((item) => (
        <SidebarLinkRow
          key={item.key}
          spec={item}
          active={isActivePath(item.href, pathname, { exact: true })}
          collapsed={collapsed}
        />
      ))}
      {groups.map((group) => (
        <NavGroup
          key={group.key}
          group={group}
          pathname={pathname}
          planningActive={planningActive}
          collapsed={collapsed}
        />
      ))}
    </div>
  );
}

function ClientNavTree({ top, pathname }: { top: SidebarLinkSpec[]; pathname: string }) {
  return (
    <div className="space-y-1">
      {top.map((item) => (
        <SidebarLinkRow
          key={item.key}
          spec={item}
          active={isActivePath(item.href, pathname, { exact: item.key === "client-review" })}
        />
      ))}
    </div>
  );
}

function AgencyNavTree({
  top,
  groups,
  pathname,
}: {
  top: SidebarLinkSpec[];
  groups: SidebarGroupSpec[];
  pathname: string;
  agencySwitcher: { active: AgencyRow | null; options: AgencyRow[] };
  platformAccess: PlatformNavigationAccess;
  collapsed: boolean;
  onCollapsedChange?: ((next: boolean) => void) | undefined;
}) {
  return (
    <div className="space-y-1">
      {top.map((item) => (
        <SidebarLinkRow
          key={item.key}
          spec={item}
          active={isActivePath(item.href, pathname, { exact: true })}
        />
      ))}
      {groups.map((group) => (
        <NavGroup
          key={group.key}
          group={group}
          pathname={pathname}
          planningActive={false}
          collapsed={false}
        />
      ))}
    </div>
  );
}

function NavGroup({
  group,
  pathname,
  planningActive,
  collapsed,
}: {
  group: SidebarGroupSpec;
  pathname: string;
  planningActive: boolean;
  collapsed: boolean;
}) {
  return (
    <div className="space-y-1">
      {group.heading ? (
        <div className="text-label text-fg-muted hidden px-2 pt-3 pb-1 font-semibold tracking-wide uppercase xl:block">
          {group.label}
        </div>
      ) : null}
      {group.items.map((item) => renderItem(item, pathname, planningActive, collapsed))}
    </div>
  );
}

function renderItem(
  item: SidebarItemSpec,
  pathname: string,
  planningActive: boolean,
  collapsed: boolean,
): React.ReactNode {
  switch (item.kind) {
    case "link":
      return (
        <SidebarLinkRow
          key={item.key}
          spec={item}
          active={isActivePath(item.href, pathname)}
          collapsed={collapsed}
        />
      );
    case "expandable":
      return (
        <ExpandableNavGroup
          key={item.key}
          spec={item}
          pathname={pathname}
          planningActive={planningActive}
          collapsed={collapsed}
        />
      );
    case "group":
      return (
        <NavGroup
          key={item.key}
          group={item}
          pathname={pathname}
          planningActive={planningActive}
          collapsed={collapsed}
        />
      );
    case "nested-group":
      return (
        <NestedNavGroup key={item.key} spec={item} pathname={pathname} collapsed={collapsed} />
      );
  }
}

function SidebarLinkRow({
  spec,
  active,
  collapsed = false,
}: {
  spec: SidebarLinkSpec;
  active: boolean;
  collapsed?: boolean;
}) {
  const Icon = spec.icon;
  const badge = spec.badge && spec.badge > 0 ? spec.badge : null;
  const ariaLabel = spec.label;
  return (
    <Link
      href={spec.href}
      aria-current={active ? "page" : undefined}
      aria-label={ariaLabel}
      title={ariaLabel}
      data-testid={spec.testId ?? `sidebar-${spec.key}`}
      className={cn(
        "text-body focus-visible:ring-focus-ring flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none",
        collapsed ? "justify-center" : "justify-start",
        active ? "bg-primary-subtle text-primary" : "text-fg-primary hover:bg-surface-subtle",
      )}
    >
      <span
        className={cn("shrink-0", active ? "text-primary" : "text-fg-secondary")}
        aria-hidden="true"
      >
        <Icon className="h-4 w-4" />
      </span>
      {!collapsed ? <span className="min-w-0 flex-1 truncate">{spec.label}</span> : null}
      {badge !== null && !collapsed ? (
        <span
          className="bg-warning-subtle text-warning text-label inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-1.5 font-semibold"
          aria-label={`${spec.label}: ${badge} pending`}
          data-testid={`sidebar-badge-${spec.key}`}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

function ExpandableNavGroup({
  spec,
  pathname,
  planningActive,
  collapsed,
}: {
  spec: SidebarExpandableGroupSpec;
  pathname: string;
  planningActive: boolean;
  collapsed: boolean;
}) {
  const Icon = spec.icon;
  const active = spec.activePrefixes.some((p) => isActivePath(p, pathname));
  const [forcedOpen, setForcedOpen] = React.useState<boolean | null>(null);
  // For the planning group we want the route family to auto-open;
  // for other groups we follow the spec's defaultOpen semantics.
  const defaultOpen = spec.key === "planning" ? planningActive : active;
  const open = forcedOpen ?? defaultOpen;
  return (
    <div className="space-y-1">
      <div
        className={cn(
          "flex min-h-11 items-center rounded-[var(--radius-control)] font-semibold transition-colors",
          active ? "bg-primary-subtle text-primary" : "text-fg-primary hover:bg-surface-subtle",
        )}
      >
        <Link
          href={spec.href}
          aria-current={active ? "page" : undefined}
          aria-label={spec.label}
          title={spec.label}
          className={cn(
            "text-body focus-visible:ring-focus-ring flex min-h-11 flex-1 items-center gap-3 rounded-[var(--radius-control)] px-3 focus:outline-none focus-visible:ring-2",
            collapsed ? "justify-center" : "justify-start",
          )}
          data-testid={spec.testId}
        >
          <span
            className={cn("shrink-0", active ? "text-primary" : "text-fg-secondary")}
            aria-hidden="true"
          >
            <Icon className="h-4 w-4" />
          </span>
          {!collapsed ? <span>{spec.label}</span> : null}
        </Link>
        {!collapsed ? (
          <button
            type="button"
            onClick={() => setForcedOpen((v) => (v === null ? !open : !v))}
            aria-label={open ? `Collapse ${spec.label}` : `Expand ${spec.label}`}
            aria-expanded={open}
            className="text-fg-secondary hover:text-fg-primary focus-visible:ring-focus-ring hidden min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] focus:outline-none focus-visible:ring-2 xl:flex"
          >
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", open ? "rotate-0" : "-rotate-90")}
              aria-hidden="true"
            />
          </button>
        ) : null}
      </div>
      {!collapsed && open ? (
        <ul className="ml-4 hidden space-y-0.5 border-l border-[var(--color-border)] pl-3 xl:block">
          {spec.children.map((child) => (
            <li key={child.key}>{renderItem(child, pathname, planningActive, collapsed)}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function NestedNavGroup({
  spec,
  pathname,
  collapsed,
}: {
  spec: SidebarNestedItemSpec;
  pathname: string;
  collapsed: boolean;
}) {
  const Icon = spec.icon;
  const activeChild = spec.items.some((it) => isActivePath(it.href, pathname));
  const [forcedOpen, setForcedOpen] = React.useState<boolean | null>(null);
  const open = forcedOpen ?? activeChild;
  return (
    <li>
      {!collapsed ? (
        <button
          type="button"
          onClick={() => setForcedOpen((v) => (v === null ? !open : !v))}
          aria-label={open ? `Collapse ${spec.label}` : `Expand ${spec.label}`}
          aria-expanded={open}
          className="text-body text-fg-secondary hover:text-fg-primary focus-visible:ring-focus-ring flex min-h-9 w-full items-center justify-between gap-2 rounded-[var(--radius-control)] px-3 font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="truncate">{spec.label}</span>
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 transition-transform",
              open ? "rotate-0" : "-rotate-90",
            )}
            aria-hidden="true"
          />
        </button>
      ) : null}
      {!collapsed && open ? (
        <ul className="mt-0.5 ml-3 space-y-0.5 border-l border-[var(--color-border)] pl-3">
          {spec.items.map((it) => (
            <SidebarLinkRow key={it.key} spec={it} active={isActivePath(it.href, pathname)} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

// ─── Hooks ─────────────────────────────────────────────────────────────────

function subscribeToHash(onStoreChange: () => void) {
  window.addEventListener("hashchange", onStoreChange);
  return () => window.removeEventListener("hashchange", onStoreChange);
}

function readHash() {
  return window.location.hash;
}

// Re-export the icon type so consumers can type their own sub-trees.
export type { IconComponent };
