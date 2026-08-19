import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { MobileNav } from "./mobile-nav";
import { WorkspaceSwitcherServer } from "./workspace-switcher.server";
import { NotificationsBell } from "./notifications-bell";
import { RouteScrollReset } from "./route-scroll-reset";

/**
 * App shell — sidebar (left, persistent on desktop) + topbar (right
 * of sidebar) + mobile bottom nav. The content area is the {children}.
 *
 * Per master prompt §3:
 *  - Desktop ≥1280px: expanded sidebar (240px), 64px topbar
 *  - Tablet 768-1279px: collapsed icon rail (64px), 64px topbar, touch ≥44px
 *  - Mobile <768px: bottom navigation, full-screen sheets
 *
 * A11y: the first focusable element is a "Skip to main content" link,
 * which is invisible until focused. The main element has a stable id
 * for the skip link to target.
 */
export function AppShell({
  user,
  notifications,
  unreadCount,
  children,
}: {
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    isAdmin: boolean;
  };
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
  children: React.ReactNode;
}) {
  return (
    <div className="bg-canvas flex min-h-screen flex-col">
      <RouteScrollReset />
      {/* Skip-to-content link for keyboard / screen-reader users. Hidden
          until focused, then snaps to the top. */}
      <a
        href="#main-content"
        className="bg-primary text-label text-on-primary focus-visible:ring-focus-ring pointer-events-none absolute top-2 left-2 z-50 inline-flex min-h-11 items-center rounded-[var(--radius-control)] px-3 py-1.5 font-semibold opacity-0 focus:pointer-events-auto focus:opacity-100 focus:outline-none focus-visible:ring-2"
      >
        Skip to main content
      </a>

      {/* Desktop sidebar (hidden below 768px) */}
      <aside className="bg-surface border-border fixed inset-y-0 left-0 z-30 hidden w-60 border-r md:flex md:flex-col">
        <Sidebar user={user} />
      </aside>

      {/* Topbar (desktop + tablet) */}
      <header className="bg-surface border-border sticky top-0 z-20 ml-0 hidden h-16 border-b md:ml-60 md:block">
        <Topbar user={user} notifications={notifications} unreadCount={unreadCount} />
      </header>

      {/* Mobile topbar (md:hidden) */}
      <header className="bg-surface border-border sticky top-0 z-20 flex h-14 items-center justify-between border-b px-4 md:hidden">
        <WorkspaceSwitcherServer testId="workspace-switcher-trigger-mobile" />
        <div className="flex items-center gap-1">
          <NotificationsBell
            initial={notifications}
            initialUnread={unreadCount}
            badgeTestId="unread-badge-mobile"
          />
          <span
            className="border-border bg-surface text-fg-primary text-label flex h-9 w-9 items-center justify-center rounded-full border font-semibold"
            aria-label={`Signed in as ${user.name}`}
          >
            {user.name.charAt(0).toUpperCase()}
          </span>
        </div>
      </header>

      {/* Main content area */}
      <main
        id="main-content"
        tabIndex={-1}
        className="pb-16 focus:outline-none md:ml-60 md:pt-16 md:pb-0"
      >
        <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8">{children}</div>
      </main>

      {/* Mobile bottom nav (hidden on tablet+) */}
      <MobileNav canCreate={user.isAdmin} />
    </div>
  );
}
