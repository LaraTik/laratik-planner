import { NotificationsBell } from "./notifications-bell";
import { UserMenu } from "./user-menu";
import type { BuildInfo } from "@/lib/build-info";

/**
 * Topbar — search + notifications + user menu. The workspace switcher
 * has moved into the sidebar bottom (per Stitch). Per master prompt
 * §3: 64px tall, 24-32px horizontal padding on desktop.
 */
export function Topbar({
  user,
  buildInfo,
  notifications,
  unreadCount,
}: {
  user: { id: string; name: string; email: string; image: string | null; isAdmin: boolean };
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
}) {
  return (
    <div className="flex h-full items-center justify-between gap-3 px-4 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <label htmlFor="app-search" className="sr-only">
          Search
        </label>
        <input
          id="app-search"
          type="search"
          placeholder="Search…"
          aria-label="Search"
          className="border-border bg-surface-subtle text-body text-fg-primary placeholder:text-fg-muted focus-visible:ring-focus-ring h-9 w-full max-w-md rounded-[var(--radius-control)] border px-3 focus:outline-none focus-visible:ring-2"
        />
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <NotificationsBell
          initial={notifications}
          initialUnread={unreadCount}
          badgeTestId="unread-badge"
        />
        <UserMenu user={user} buildInfo={buildInfo} />
      </div>
    </div>
  );
}
