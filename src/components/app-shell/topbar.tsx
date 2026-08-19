import { UserMenu } from "./user-menu";
import { WorkspaceSwitcherServer } from "./workspace-switcher.server";
import { NotificationsBell } from "./notifications-bell";

/**
 * Topbar — search, notifications, workspace switcher, user menu.
 * Per master prompt §3: 64px tall, 24-32px horizontal padding on desktop.
 */
export function Topbar({
  user,
  notifications,
  unreadCount,
}: {
  user: { id: string; name: string; email: string; image: string | null; isAdmin: boolean };
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
      <div className="flex min-w-0 items-center gap-2">
        <WorkspaceSwitcherServer testId="workspace-switcher-trigger" />
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <NotificationsBell
          initial={notifications}
          initialUnread={unreadCount}
          badgeTestId="unread-badge"
        />
        <UserMenu user={user} />
      </div>
    </div>
  );
}
