"use client";

import { usePathname } from "next/navigation";
import { NotificationsBell, type NotificationsCopy } from "./notifications-bell";
import { UserMenu, type UserMenuCopy } from "./user-menu";
import { ThemeToggle, type ThemeToggleCopy } from "./theme-toggle";
import { AgencySwitcher, type AgencyRow } from "./agency-switcher";
import { agencySwitcherCopy } from "./agency-switcher-copy";
import { WorkspaceSwitcher } from "./workspace-switcher";
import type { BuildInfo } from "@/lib/build-info";
import type { ThemePreference } from "@/lib/theme/preferences";
import type { PlatformNavigationAccess } from "@/lib/auth/platform-navigation-access";

/**
 * Compact shell bar — tenant context, notifications, theme, and user menu.
 * Search was removed until a real cross-workspace search contract exists;
 * a non-functional input created a misleading dead end on every screen.
 *
 * The topbar is a thin pass-through: the (app) layout resolves the
 * translator and supplies the localized `chrome` copy. The
 * notifications bell and the user menu receive the same copy
 * bundle shape they declare; the topbar itself does no
 * translation work.
 */
export function Topbar({
  user,
  buildInfo,
  notifications,
  unreadCount,
  agencySwitcher,
  workspaces,
  canCreateWorkspace,
  platformAccess,
  labels,
  activeAgency,
  themePreference,
  chrome,
}: {
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    isAdmin: boolean;
    isPlatformAdmin?: boolean;
  };
  buildInfo: BuildInfo;
  notifications: {
    id: string;
    kind: string;
    title: string;
    body: string;
    actionUrl: string | null;
    readAt: string | null;
    createdAt: string;
  }[];
  unreadCount: number;
  agencySwitcher: { active: AgencyRow | null; options: AgencyRow[] };
  workspaces: { id: string; name: string; slug: string }[];
  canCreateWorkspace: boolean;
  platformAccess: PlatformNavigationAccess;
  labels: Record<string, string>;
  activeAgency?: { name: string; isAdmin: boolean } | null | undefined;
  themePreference: ThemePreference;
  chrome: { userMenu: UserMenuCopy; notifications: NotificationsCopy; theme: ThemeToggleCopy };
}) {
  const pathname = usePathname();
  const workspaceSlug = pathname.match(/^\/app\/w\/([^/]+)/)?.[1];
  const activeWorkspace = workspaceSlug
    ? (workspaces.find((workspace) => workspace.slug === workspaceSlug) ?? null)
    : null;

  return (
    <div className="flex h-full items-center justify-between gap-4 px-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-2" data-testid="topbar-scope-switchers">
        <span className="text-label text-fg-muted hidden font-semibold tracking-wide uppercase lg:inline">
          {labels["tenantLabel"] ?? "Tenant"}
        </span>
        <AgencySwitcher
          active={agencySwitcher.active}
          options={agencySwitcher.options}
          isPlatformAdmin={platformAccess.canEnter}
          compact
          variant="header"
          copy={agencySwitcherCopy(labels)}
          testId="topbar-agency-switcher-trigger"
        />
        <span aria-hidden="true" className="bg-border h-5 w-px shrink-0" />
        <WorkspaceSwitcher
          active={activeWorkspace}
          options={workspaces}
          canCreate={canCreateWorkspace}
          compact
          variant="header"
          copy={{
            activeAria:
              labels["workspaceSwitcherActiveAria"] ?? "Active workspace: {name}. Click to switch.",
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
          testId="topbar-workspace-switcher-trigger"
        />
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <ThemeToggle preference={themePreference} copy={chrome.theme} />
        <NotificationsBell
          initial={notifications}
          initialUnread={unreadCount}
          badgeTestId="unread-badge"
          copy={chrome.notifications}
        />
        <UserMenu
          user={user}
          buildInfo={buildInfo}
          activeAgency={activeAgency}
          copy={chrome.userMenu}
        />
      </div>
    </div>
  );
}
