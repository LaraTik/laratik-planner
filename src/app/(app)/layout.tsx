import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { listActorAgencies, resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { currentActor } from "@/lib/auth/current-actor";
import { AppShell } from "@/components/app-shell/app-shell";
import { countUnreadNotifications, listNotificationsForUser } from "@/lib/notifications/service";
import { listSwitcherWorkspaces } from "@/lib/workspaces/context";
import { isPlatformAdmin as checkPlatformAdmin } from "@/lib/auth/platform-admin";
import { listActiveGrantsForActor } from "@/lib/support";
import { db } from "@/lib/db";
import { agencies, agencyMemberships } from "@/lib/db/schema";
import { and, eq, isNotNull, or } from "drizzle-orm";
import { createBuildInfo } from "@/lib/build-info";
import { serverEnv } from "@/lib/validation/env";

/**
 * Authenticated app shell — wraps every page under (app)/*.
 *
 * Gates:
 *  1. Not signed in → /signin
 *  2. Signed in but no agency configured → /setup
 *  3. Signed in + agency, but no workspace membership → /app/workspaces/new
 *     (or /app for admins who can create the first workspace)
 *
 * The full workspace list is fetched here once per request and passed
 * down to the sidebar so it can detect the current workspace from
 * `usePathname()` and render the workspace-scoped nav.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }

  const actor = await currentActor();
  if (!actor) {
    redirect("/signin");
  }
  const ctx = await resolveActiveAgencyContext({ actor });
  const agencyId = ctx?.agencyId ?? null;
  const platformAdmin = await checkPlatformAdmin(actor);
  if (!agencyId && !platformAdmin) {
    const [inactiveMembership] = await db
      .select({ id: agencies.id })
      .from(agencyMemberships)
      .innerJoin(agencies, eq(agencies.id, agencyMemberships.agencyId))
      .where(
        and(
          eq(agencyMemberships.userId, actor.id),
          eq(agencyMemberships.status, "active"),
          or(isNotNull(agencies.suspendedAt), isNotNull(agencies.archivedAt)),
        ),
      )
      .limit(1);
    if (inactiveMembership) redirect("/agency-unavailable");
    redirect("/setup");
  }

  if (agencyId && !platformAdmin) {
    const [agency] = await db
      .select({ suspendedAt: agencies.suspendedAt, archivedAt: agencies.archivedAt })
      .from(agencies)
      .where(eq(agencies.id, agencyId))
      .limit(1);
    if (agency?.suspendedAt || agency?.archivedAt) redirect("/agency-unavailable");
  }

  const isAdmin = agencyId ? await isAgencyAdmin(actor, agencyId) : false;
  const [notifications, unreadCount, switcher, agencyOptions] = await Promise.all([
    listNotificationsForUser(actor, { limit: 10 }),
    countUnreadNotifications(actor),
    listSwitcherWorkspaces(actor),
    listActorAgencies(actor),
  ]);

  // M3.5 — fetch the calling platform admin's active support
  // access grants so the persistent banner can show. Only
  // fetched when the actor is a platform admin (the banner is
  // never shown to non-platform-admins; the support-access
  // surface is platform-only). The `remainingMinutes` is
  // pre-computed server-side so the banner component does not
  // call Date.now() during render (React 19 purity rule).
  const supportGrantsRaw = platformAdmin ? await listActiveGrantsForActor(actor) : [];
  // `new Date()` is the React-purity-safe form of the
  // request-time clock; the resulting object's `getTime()` is
  // what the banner calculation reads.
  const requestClock = new Date();
  const supportGrants = supportGrantsRaw.map((g) => ({
    id: g.id,
    targetAgencyId: g.targetAgencyId,
    scopeWorkspaceId: g.scopeWorkspaceId,
    scopeMetadataOnly: g.scopeMetadataOnly,
    downloadsAllowed: g.downloadsAllowed,
    activatedAt: g.activatedAt.toISOString(),
    expiresAt: g.expiresAt.toISOString(),
    remainingMinutes: Math.max(
      0,
      Math.floor((g.expiresAt.getTime() - requestClock.getTime()) / 60000),
    ),
  }));

  // The "active" agency for the sidebar switcher is the singleton
  // (M1.2 / M1.6 invariant). When M1.6 lands and the resolver
  // becomes the canonical source, this becomes the resolver result
  // — for M1.5 the singleton is the only agency and therefore the
  // only valid active row.
  const activeAgency = agencyOptions.find((a) => a.id === agencyId) ?? null;
  const buildInfo = createBuildInfo({
    version: serverEnv.APP_VERSION,
    environment: serverEnv.NODE_ENV,
  });

  return (
    <AppShell
      buildInfo={buildInfo}
      user={{
        id: session.user.id,
        name: session.user.name ?? session.user.email ?? "User",
        email: session.user.email ?? "",
        image: session.user.image ?? null,
        isAdmin,
      }}
      workspaces={switcher.options}
      agencySwitcher={{ active: activeAgency, options: agencyOptions }}
      canCreateWorkspace={switcher.isAdmin}
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
      isPlatformAdmin={platformAdmin}
      supportGrants={supportGrants}
    >
      {children}
    </AppShell>
  );
}
