import { NotificationsBell, type NotificationsCopy } from "./notifications-bell";
import { UserMenu, type UserMenuCopy } from "./user-menu";
import type { BuildInfo } from "@/lib/build-info";

/**
 * Compact utility bar — notifications + user menu. Search was removed
 * until a real cross-workspace search contract exists; a non-functional
 * input created a misleading dead end on every authenticated screen.
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
  activeAgency,
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
  activeAgency?: { name: string; isAdmin: boolean } | null | undefined;
  chrome: { userMenu: UserMenuCopy; notifications: NotificationsCopy };
}) {
  return (
    <div className="flex h-full items-center justify-end px-3 sm:px-6">
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
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
