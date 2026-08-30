import { NotificationsBell } from "./notifications-bell";
import { UserMenu } from "./user-menu";
import type { BuildInfo } from "@/lib/build-info";

/**
 * Compact utility bar — notifications + user menu. Search was removed
 * until a real cross-workspace search contract exists; a non-functional
 * input created a misleading dead end on every authenticated screen.
 */
export function Topbar({
  user,
  buildInfo,
  notifications,
  unreadCount,
  activeAgency,
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
  activeAgency?: { name: string; isAdmin: boolean } | null | undefined;
}) {
  return (
    <div className="flex h-full items-center justify-end px-3 sm:px-6">
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <NotificationsBell
          initial={notifications}
          initialUnread={unreadCount}
          badgeTestId="unread-badge"
        />
        <UserMenu user={user} buildInfo={buildInfo} activeAgency={activeAgency} />
      </div>
    </div>
  );
}
