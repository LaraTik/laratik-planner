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
 *      - Brand: logo + unified agency/workspace context switchers (at the top)
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
 *      - The same context switchers stay at the top so tenant selection is
 *        predictable on both global and workspace routes.
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
  labels = {},
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
  /**
   * Localized label map. Keys match the navigation-model spec
   * `key` (e.g. `my-work`, `workspaces`, `planning`, `brand`,
   * `settings`) plus three chrome keys: `sidebarAriaLabel`,
   * `studioFlowHome`, `createContent`. The English `label`
   * baked into each spec is the fallback when a key is missing.
   */
  labels?: Record<string, string>;
}) {
  const pathname = usePathname();
  const labelFor = React.useCallback(
    (key: string, fallback: string) => labels[key] ?? fallback,
    [labels],
  );

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
    <nav
      className="flex h-full min-w-0 flex-col overflow-x-hidden"
      aria-label={labelFor("sidebarAriaLabel", "Primary")}
    >
      {/* Brand + unified agency/workspace context (top) */}
      <SidebarHeader
        collapsed={collapsed}
        currentWorkspace={currentWorkspace}
        workspaceSwitcherOptions={workspaceSwitcherOptions}
        canCreateWorkspace={canCreateWorkspace}
        agencySwitcher={agencySwitcher}
        platformAccess={platformAccess}
        onCollapsedChange={onCollapsedChange}
        labels={labels}
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
            labels={labels}
          />
        ) : clientNav ? (
          <ClientNavTree top={clientNav.top} pathname={pathname} labels={labels} />
        ) : agencyNav ? (
          <AgencyNavTree
            top={agencyNav.top}
            groups={agencyNav.groups}
            pathname={pathname}
            agencySwitcher={agencySwitcher}
            platformAccess={platformAccess}
            collapsed={collapsed}
            onCollapsedChange={onCollapsedChange}
            labels={labels}
          />
        ) : null}
      </div>

      {/* Bottom section: actions + meta + switcher */}
      <SidebarFooter
        collapsed={collapsed}
        inWorkspace={Boolean(inWorkspace)}
        createContentHref={createContentHref}
        labels={labels}
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
  agencySwitcher,
  platformAccess,
  onCollapsedChange,
  labels = {},
}: {
  collapsed: boolean;
  currentWorkspace: { id: string; name: string; slug: string } | null;
  workspaceSwitcherOptions: { id: string; name: string; slug: string }[];
  canCreateWorkspace: boolean;
  agencySwitcher?: { active: AgencyRow | null; options: AgencyRow[] };
  platformAccess: PlatformNavigationAccess;
  onCollapsedChange?: ((next: boolean) => void) | undefined;
  labels?: Record<string, string>;
}) {
  const brand = labels["studioFlowHome"] ?? "StudioFlow home";
  const brandTitle = labels["agencyLabelFallback"] ?? "StudioFlow";
  return (
    <div className={cn("flex flex-col gap-1 px-2 pt-2 pb-2 xl:px-3")}>
      <div
        className={cn(
          "flex items-center gap-2",
          collapsed ? "justify-center" : "justify-center xl:justify-between",
        )}
      >
        <Link
          href="/app"
          className={cn(
            "focus-visible:ring-focus-ring flex items-center gap-2 rounded-[var(--radius-control)] focus:outline-none focus-visible:ring-2",
            collapsed ? "justify-center" : "flex-1 justify-center xl:justify-start",
          )}
          aria-label={brand}
          title={brandTitle}
        >
          <div className="bg-primary flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] font-bold text-white">
            S
          </div>
          {!collapsed ? (
            <div className="hidden min-w-0 xl:block">
              <p className="text-section-title text-fg-primary truncate font-semibold">
                StudioFlow
              </p>
            </div>
          ) : null}
        </Link>
        {!collapsed && onCollapsedChange ? (
          <SidebarCollapseToggle collapsed={collapsed} variant="header" />
        ) : null}
      </div>
      {!collapsed || currentWorkspace || workspaceSwitcherOptions.length > 0 ? (
        <div
          className="border-border bg-surface-subtle mt-2 flex flex-col gap-0.5 rounded-[var(--radius-card)] border p-1"
          role="group"
          aria-label={labels["contextLabel"] ?? "Agency and workspace context"}
          data-testid="sidebar-context-switchers"
        >
          {agencySwitcher && (agencySwitcher.options.length > 0 || platformAccess.canEnter) ? (
            <AgencySwitcher
              active={agencySwitcher.active}
              options={agencySwitcher.options}
              isPlatformAdmin={platformAccess.canEnter}
              compact
              copy={{
                activeAria:
                  labels["agencySwitcherActiveAria"] ?? "Active agency: {name}. Click to switch.",
                selectAria:
                  labels["agencySwitcherSelectAria"] ?? "Select an agency. Click to open.",
                selectAgency: labels["agencySwitcherSelect"] ?? "Select agency",
                noAgenciesAria: labels["agencySwitcherNoAgenciesAria"] ?? "No agencies",
                noAgency: labels["agencySwitcherNoAgency"] ?? "No agency",
                switchTitle: labels["agencySwitcherSwitchTitle"] ?? "Switch agency",
                listAria: labels["agencySwitcherListAria"] ?? "Agencies",
                noAgenciesYet: labels["agencySwitcherNoAgenciesYet"] ?? "No agencies yet.",
                createNew: labels["agencySwitcherCreateNew"] ?? "Create new agency",
                adminLabel: labels["agencySwitcherAdminLabel"] ?? "Agency admin",
                switchNotMember:
                  labels["agencySwitcherSwitchNotMember"] ??
                  "You're no longer a member of that agency.",
                sessionExpired:
                  labels["agencySwitcherSessionExpired"] ??
                  "Your session expired. Please sign in again.",
                switchFailed:
                  labels["agencySwitcherSwitchFailed"] ??
                  "Couldn't switch agencies. Please try again or contact support.",
                switchFailedShort:
                  labels["agencySwitcherSwitchFailedShort"] ??
                  "Couldn't switch agencies. Please try again.",
              }}
              testId="sidebar-agency-switcher-trigger"
            />
          ) : null}
          <WorkspaceSwitcher
            active={currentWorkspace}
            options={workspaceSwitcherOptions}
            canCreate={canCreateWorkspace}
            compact
            copy={{
              activeAria:
                labels["workspaceSwitcherActiveAria"] ??
                "Active workspace: {name}. Click to switch.",
              selectAria:
                labels["workspaceSwitcherSelectAria"] ?? "Select a workspace. Click to open.",
              selectWorkspace: labels["workspaceSwitcherSelect"] ?? "Select workspace",
              noWorkspacesAria: labels["workspaceSwitcherNoWorkspacesAria"] ?? "No workspaces",
              createFirst: labels["workspaceSwitcherCreateFirst"] ?? "Create your first workspace",
              switchTitle: labels["workspaceSwitcherSwitchTitle"] ?? "Switch workspace",
              listAria: labels["workspaceSwitcherListAria"] ?? "Workspaces",
              noWorkspacesYet: labels["workspaceSwitcherNoWorkspacesYet"] ?? "No workspaces yet.",
              newWorkspace: labels["workspaceSwitcherNew"] ?? "New workspace",
            }}
            testId="sidebar-workspace-switcher-trigger"
          />
        </div>
      ) : null}
    </div>
  );
}

function SidebarFooter({
  collapsed,
  inWorkspace,
  createContentHref,
  labels = {},
}: {
  collapsed: boolean;
  inWorkspace: boolean;
  createContentHref: string | null;
  labels?: Record<string, string>;
}) {
  const createContentLabel = labels["createContent"] ?? "Create content";
  return (
    <div className="border-border mt-auto space-y-1 border-t p-2 xl:p-3">
      {inWorkspace && createContentHref ? (
        <Link
          href={createContentHref}
          className={cn(
            "bg-primary hover:bg-primary-hover text-button flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] px-3 py-2 font-semibold text-white transition-colors",
            collapsed ? "" : "",
          )}
          aria-label={createContentLabel}
          title={createContentLabel}
          data-testid="sidebar-create-content"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span className="hidden xl:inline">{createContentLabel}</span>
        </Link>
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
  labels = {},
}: {
  top: SidebarLinkSpec[];
  groups: SidebarGroupSpec[];
  pathname: string;
  planningActive: boolean;
  collapsed: boolean;
  labels?: Record<string, string>;
}) {
  return (
    <div className="space-y-1">
      {top.map((item) => (
        <SidebarLinkRow
          key={item.key}
          spec={item}
          active={isActivePath(item.href, pathname, { exact: true })}
          collapsed={collapsed}
          labels={labels}
        />
      ))}
      {groups.map((group) => (
        <NavGroup
          key={group.key}
          group={group}
          pathname={pathname}
          planningActive={planningActive}
          collapsed={collapsed}
          labels={labels}
        />
      ))}
    </div>
  );
}

function ClientNavTree({
  top,
  pathname,
  labels = {},
}: {
  top: SidebarLinkSpec[];
  pathname: string;
  labels?: Record<string, string>;
}) {
  return (
    <div className="space-y-1">
      {top.map((item) => (
        <SidebarLinkRow
          key={item.key}
          spec={item}
          active={isActivePath(item.href, pathname, { exact: item.key === "client-review" })}
          labels={labels}
        />
      ))}
    </div>
  );
}

function AgencyNavTree({
  top,
  groups,
  pathname,
  labels = {},
}: {
  top: SidebarLinkSpec[];
  groups: SidebarGroupSpec[];
  pathname: string;
  agencySwitcher: { active: AgencyRow | null; options: AgencyRow[] };
  platformAccess: PlatformNavigationAccess;
  collapsed: boolean;
  onCollapsedChange?: ((next: boolean) => void) | undefined;
  labels?: Record<string, string>;
}) {
  return (
    <div className="space-y-1">
      {top.map((item) => (
        <SidebarLinkRow
          key={item.key}
          spec={item}
          active={isActivePath(item.href, pathname, { exact: true })}
          labels={labels}
        />
      ))}
      {groups.map((group) => (
        <NavGroup
          key={group.key}
          group={group}
          pathname={pathname}
          planningActive={false}
          collapsed={false}
          labels={labels}
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
  labels = {},
}: {
  group: SidebarGroupSpec;
  pathname: string;
  planningActive: boolean;
  collapsed: boolean;
  labels?: Record<string, string>;
}) {
  const groupLabel = labels[group.key] ?? group.label;
  return (
    <div className="space-y-1">
      {group.heading ? (
        <div className="text-label text-fg-muted hidden px-2 pt-3 pb-1 font-semibold tracking-wide uppercase xl:block">
          {groupLabel}
        </div>
      ) : null}
      {group.items.map((item) => renderItem(item, pathname, planningActive, collapsed, labels))}
    </div>
  );
}

function renderItem(
  item: SidebarItemSpec,
  pathname: string,
  planningActive: boolean,
  collapsed: boolean,
  labels: Record<string, string>,
): React.ReactNode {
  switch (item.kind) {
    case "link":
      return (
        <SidebarLinkRow
          key={item.key}
          spec={item}
          active={isActivePath(item.href, pathname)}
          collapsed={collapsed}
          labels={labels}
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
          labels={labels}
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
          labels={labels}
        />
      );
    case "nested-group":
      return (
        <NestedNavGroup
          key={item.key}
          spec={item}
          pathname={pathname}
          collapsed={collapsed}
          labels={labels}
        />
      );
  }
}

function SidebarLinkRow({
  spec,
  active,
  collapsed = false,
  labels = {},
}: {
  spec: SidebarLinkSpec;
  active: boolean;
  collapsed?: boolean;
  labels?: Record<string, string>;
}) {
  const Icon = spec.icon;
  const badge = spec.badge && spec.badge > 0 ? spec.badge : null;
  const label = labels[spec.key] ?? spec.label;
  const ariaLabel = label;
  const pendingTemplate = labels["pendingBadge"] ?? "{label}: {count} pending";
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
      {!collapsed ? <span className="hidden min-w-0 flex-1 truncate xl:block">{label}</span> : null}
      {badge !== null && !collapsed ? (
        <span
          className="bg-warning-subtle text-warning text-label hidden min-w-[1.5rem] items-center justify-center rounded-full px-1.5 font-semibold xl:inline-flex"
          aria-label={pendingTemplate.replace("{label}", label).replace("{count}", String(badge))}
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
  labels = {},
}: {
  spec: SidebarExpandableGroupSpec;
  pathname: string;
  planningActive: boolean;
  collapsed: boolean;
  labels?: Record<string, string>;
}) {
  const Icon = spec.icon;
  const active = spec.activePrefixes.some((p) => isActivePath(p, pathname));
  const [forcedOpen, setForcedOpen] = React.useState<boolean | null>(null);
  // For the planning group we want the route family to auto-open;
  // for other groups we follow the spec's defaultOpen semantics.
  const defaultOpen = spec.key === "planning" ? planningActive : active;
  const open = forcedOpen ?? defaultOpen;
  const label = labels[spec.key] ?? spec.label;
  const collapseTemplate = labels["collapseGroup"] ?? "Collapse {label}";
  const expandTemplate = labels["expandGroup"] ?? "Expand {label}";
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
          aria-label={label}
          title={label}
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
          {!collapsed ? <span className="hidden xl:inline">{label}</span> : null}
        </Link>
        {!collapsed ? (
          <button
            type="button"
            onClick={() => setForcedOpen((v) => (v === null ? !open : !v))}
            aria-label={
              open
                ? collapseTemplate.replace("{label}", label)
                : expandTemplate.replace("{label}", label)
            }
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
        <ul className="ms-4 hidden space-y-0.5 border-s border-[var(--color-border)] ps-3 xl:block">
          {spec.children.map((child) => (
            <li key={child.key}>
              {renderItem(child, pathname, planningActive, collapsed, labels)}
            </li>
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
  labels = {},
}: {
  spec: SidebarNestedItemSpec;
  pathname: string;
  collapsed: boolean;
  labels?: Record<string, string>;
}) {
  const Icon = spec.icon;
  const activeChild = spec.items.some((it) => isActivePath(it.href, pathname));
  const [forcedOpen, setForcedOpen] = React.useState<boolean | null>(null);
  const open = forcedOpen ?? activeChild;
  const label = labels[spec.key] ?? spec.label;
  const collapseTemplate = labels["collapseGroup"] ?? "Collapse {label}";
  const expandTemplate = labels["expandGroup"] ?? "Expand {label}";
  return (
    <div>
      {!collapsed ? (
        <button
          type="button"
          onClick={() => setForcedOpen((v) => (v === null ? !open : !v))}
          aria-label={
            open
              ? collapseTemplate.replace("{label}", label)
              : expandTemplate.replace("{label}", label)
          }
          aria-expanded={open}
          className="text-body text-fg-secondary hover:text-fg-primary focus-visible:ring-focus-ring flex min-h-9 w-full items-center justify-between gap-2 rounded-[var(--radius-control)] px-3 font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="truncate">{label}</span>
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
        <ul className="ms-3 mt-0.5 space-y-0.5 border-s border-[var(--color-border)] ps-3">
          {spec.items.map((it) => (
            <SidebarLinkRow
              key={it.key}
              spec={it}
              active={isActivePath(it.href, pathname)}
              labels={labels}
            />
          ))}
        </ul>
      ) : null}
    </div>
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
