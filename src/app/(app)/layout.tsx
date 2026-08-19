import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { activeAgencyId, isAgencyAdmin } from "@/lib/auth/policy";
import { AppShell } from "@/components/app-shell/app-shell";
import { countUnreadNotifications, listNotificationsForUser } from "@/lib/notifications/service";

/**
 * Authenticated app shell — wraps every page under (app)/*.
 *
 * Gates:
 *  1. Not signed in → /signin
 *  2. Signed in but no agency configured → /setup
 *  3. Signed in + agency, but no workspace membership → /app/workspaces/new
 *     (or /app for admins who can create the first workspace)
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }

  const agencyId = await activeAgencyId();
  if (!agencyId) {
    redirect("/setup");
  }

  const isAdmin = await isAgencyAdmin({ id: session.user.id }, agencyId);
  const [notifications, unreadCount] = await Promise.all([
    listNotificationsForUser({ id: session.user.id }, { limit: 10 }),
    countUnreadNotifications({ id: session.user.id }),
  ]);

  return (
    <AppShell
      user={{
        id: session.user.id,
        name: session.user.name ?? session.user.email ?? "User",
        email: session.user.email ?? "",
        image: session.user.image ?? null,
        isAdmin,
      }}
      notifications={notifications.map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        actionUrl: n.actionUrl,
        readAt: n.readAt ? n.readAt.toISOString() : null,
        createdAt: n.createdAt.toISOString(),
      }))}
      unreadCount={unreadCount}
    >
      {children}
    </AppShell>
  );
}
