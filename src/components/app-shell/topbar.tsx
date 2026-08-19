import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserMenu } from "./user-menu";
import { WorkspaceSwitcher } from "./workspace-switcher";
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
    <div className="flex h-full items-center justify-between gap-4 px-6">
      <div className="flex items-center gap-3">
        <WorkspaceSwitcher />
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Search">
          <Search className="h-4 w-4" aria-hidden="true" />
        </Button>
        <NotificationsBell initial={notifications} initialUnread={unreadCount} />
        <UserMenu user={user} />
      </div>
    </div>
  );
}
