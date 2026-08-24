import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { MobileNav } from "./mobile-nav";
import { NotificationsBell } from "./notifications-bell";
import { RouteScrollReset } from "./route-scroll-reset";
import { SupportSessionBanner } from "./support-session-banner";
import { UserMenu } from "./user-menu";
import { MobileContextHeader } from "./mobile-context-header";
import type { AgencyRow } from "./agency-switcher";
import type { BuildInfo } from "@/lib/build-info";

/**
 * App shell — sidebar (left, persistent on desktop) + topbar (right
 * of sidebar) + mobile bottom nav. The content area is the {children}.
 *
 * Per Stitch design (project 5403097764334458790):
 *  - Desktop ≥1280px: expanded sidebar (248px), 64px topbar
 *  - Tablet 768-1279px: collapsed icon rail (64px), 64px topbar, touch ≥44px
 *  - Mobile <768px: bottom navigation, full-screen sheets
 *
 * The sidebar is workspace-aware: it inspects the current pathname
 * and renders either the global nav (My Work, Workspaces, admin) or
 * the workspace nav (Overview, Planning, Calendar, Reviews, Social
 * Channels, Brand Kit, Team) depending on whether the URL lives
 * under /app/w/[slug]/*.
 *
 * A11y: the first focusable element is a "Skip to main content" link,
 * which is invisible until focused. The main element has a stable id
 * for the skip link to target.
 */
export function AppShell({
  user,
  buildInfo,
  workspaces,
  workspaceAccess,
  workspaceCanCreateContent,
  agencySwitcher,
  canCreateWorkspace,
  notifications,
  unreadCount,
  isPlatformAdmin,
  supportGrants = [],
  children,
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
  workspaces: { id: string; slug: string; name: string }[];
  workspaceAccess: Record<string, "internal" | "client" | "none">;
  workspaceCanCreateContent: Record<string, boolean>;
  agencySwitcher: { active: AgencyRow | null; options: AgencyRow[] };
  canCreateWorkspace: boolean;
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
  isPlatformAdmin: boolean;
  supportGrants?: Array<{
    id: string;
    targetAgencyId: string;
    scopeWorkspaceId: string | null;
    scopeMetadataOnly: boolean;
    downloadsAllowed: boolean;
    activatedAt: string;
    expiresAt: string;
    remainingMinutes: number;
  }>;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-canvas flex min-h-screen flex-col">
      <RouteScrollReset />
      {/* Skip-to-content link for keyboard / screen-reader users. Hidden
          until focused, then snaps to the top. */}
      <a
        href="#main-content"
        className="bg-primary text-label focus-visible:ring-focus-ring pointer-events-none absolute top-2 left-2 z-50 inline-flex min-h-11 items-center rounded-[var(--radius-control)] px-3 py-1.5 font-semibold text-white opacity-0 focus:pointer-events-auto focus:opacity-100 focus:outline-none focus-visible:ring-2"
      >
        Skip to main content
      </a>

      {/* Tablet icon rail (72px) expands to the full 248px sidebar at xl. */}
      <aside
        className="group/sidebar bg-surface border-border fixed inset-y-0 left-0 z-30 hidden w-[72px] border-r md:flex md:flex-col xl:w-[248px]"
        data-testid="app-sidebar"
      >
        <Sidebar
          user={user}
          workspaces={workspaces}
          workspaceAccess={workspaceAccess}
          workspaceCanCreateContent={workspaceCanCreateContent}
          workspaceSwitcherOptions={workspaces}
          agencySwitcher={agencySwitcher}
          canCreateWorkspace={canCreateWorkspace}
          isPlatformAdmin={isPlatformAdmin}
        />
      </aside>

      {/* Topbar (desktop + tablet) — search + notifications + user menu */}
      <header className="bg-surface border-border sticky top-0 z-20 ml-0 hidden h-14 border-b md:ml-[72px] md:block xl:ml-[248px]">
        <Topbar
          user={user}
          buildInfo={buildInfo}
          notifications={notifications}
          unreadCount={unreadCount}
        />
      </header>

      {/* Mobile topbar (md:hidden) — workspace identity + notifications + avatar */}
      <header className="bg-surface border-border sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b px-3 md:hidden">
        <MobileContextHeader workspaces={workspaces} />
        <div className="flex items-center gap-1">
          <NotificationsBell
            initial={notifications}
            initialUnread={unreadCount}
            badgeTestId="unread-badge-mobile"
          />
          <UserMenu
            user={{ ...user, isPlatformAdmin: isPlatformAdmin || user.isPlatformAdmin || false }}
            buildInfo={buildInfo}
            variant="mobile"
          />
        </div>
      </header>

      {/* Main content area */}
      <main
        id="main-content"
        tabIndex={-1}
        className="pb-[calc(5.25rem+env(safe-area-inset-bottom))] focus:outline-none md:ml-[72px] md:pb-0 xl:ml-[248px]"
      >
        <div className="mx-auto w-full max-w-7xl px-4 py-5 md:px-6 md:py-6 xl:px-8 xl:py-8">
          <SupportSessionBanner grants={supportGrants} />
          {children}
        </div>
      </main>

      {/* Mobile bottom nav (hidden on tablet+) */}
      <MobileNav
        user={{ isAdmin: user.isAdmin }}
        workspaces={workspaces}
        workspaceAccess={workspaceAccess}
        workspaceCanCreateContent={workspaceCanCreateContent}
        agencySwitcher={agencySwitcher}
        canCreateWorkspace={canCreateWorkspace}
        isPlatformAdmin={isPlatformAdmin}
      />
    </div>
  );
}
