import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import {
  canAccessClientWorkspace,
  canAccessInternalWorkspace,
  isAgencyAdmin,
} from "@/lib/auth/policy";
import { listActorAgencies, resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { currentActor } from "@/lib/auth/current-actor";
import { AppShell } from "@/components/app-shell/app-shell";
import {
  countUnreadNotifications,
  listNotificationsForUser,
  renderNotificationCopy,
} from "@/lib/notifications/service";
import { listSwitcherWorkspaces } from "@/lib/workspaces/context";
import { getPlatformPrincipal } from "@/lib/auth/platform-access";
import type { PlatformNavigationAccess } from "@/lib/auth/platform-navigation-access";
import { listActiveGrantsForActor } from "@/lib/support";
import { db } from "@/lib/db";
import {
  agencies,
  agencyMemberships,
  workspaceMembershipRoles,
  workspaceMemberships,
} from "@/lib/db/schema";
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { createBuildInfo } from "@/lib/build-info";
import { serverEnv } from "@/lib/validation/env";
import { getWorkspaceBadges, getGlobalBadges } from "@/lib/nav/badges";
import { readSidebarCollapsed } from "@/lib/nav/sidebar-preference";
import { tForActive } from "@/lib/i18n/t-for-active";
import type { AppShellChrome } from "@/components/app-shell/app-shell";

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
  const { t, code: activeLocale } = await tForActive();
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
  const platformPrincipal = await getPlatformPrincipal(actor);
  const platformAccess: PlatformNavigationAccess = {
    canEnter: platformPrincipal?.permissions.has("platform.console.read") === true,
    canReadAgencies: platformPrincipal?.permissions.has("platform.agency.read") === true,
    canReadSecurity:
      platformPrincipal?.permissions.has("platform.audit.read") === true ||
      platformPrincipal?.permissions.has("platform.support.request") === true,
    canReadAccess: platformPrincipal?.permissions.has("platform.access.read") === true,
  };
  const platformAdmin = platformAccess.canEnter;
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
  const workspaceAccess = Object.fromEntries(
    await Promise.all(
      switcher.options.map(async (workspace) => {
        if (await canAccessInternalWorkspace(actor, workspace.id)) {
          return [workspace.id, "internal"] as const;
        }
        if (await canAccessClientWorkspace(actor, workspace.id)) {
          return [workspace.id, "client"] as const;
        }
        return [workspace.id, "none"] as const;
      }),
    ),
  );
  const workspaceIds = switcher.options.map((workspace) => workspace.id);
  const contentCreatorRows =
    !isAdmin && workspaceIds.length > 0
      ? await db
          .select({ workspaceId: workspaceMemberships.workspaceId })
          .from(workspaceMemberships)
          .innerJoin(
            workspaceMembershipRoles,
            eq(workspaceMembershipRoles.workspaceMembershipId, workspaceMemberships.id),
          )
          .where(
            and(
              eq(workspaceMemberships.userId, actor.id),
              eq(workspaceMemberships.status, "active"),
              inArray(workspaceMemberships.workspaceId, workspaceIds),
              inArray(workspaceMembershipRoles.role, ["workspace_manager", "content_planner"]),
            ),
          )
      : [];
  const creatorWorkspaceIds = new Set(contentCreatorRows.map((row) => row.workspaceId));
  const workspaceCanCreateContent = Object.fromEntries(
    switcher.options.map((workspace) => [
      workspace.id,
      isAdmin || creatorWorkspaceIds.has(workspace.id),
    ]),
  );

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

  // Compute per-workspace sidebar badge counts in parallel with the
  // global badge set. The badge service is permission-aware — a
  // user without internal access gets 0 for that workspace.
  const [sidebarCollapsed, globalBadges, workspaceBadges] = await Promise.all([
    readSidebarCollapsed(),
    getGlobalBadges(actor, platformAdmin),
    Promise.all(
      switcher.options.map(async (ws) => {
        const badges = await getWorkspaceBadges(actor, ws.id);
        return [ws.id, badges] as const;
      }),
    ),
  ]);
  const workspaceBadgesMap: Record<string, { approvals: number; designQueue: number }> =
    Object.fromEntries(workspaceBadges);

  // Resolved chrome copy. Every label the user sees in the
  // notifications bell, the user menu, the mobile topbar, and
  // the sidebar navigation is sourced from the message catalog
  // here. The translators are interpolated at the top of the
  // request so the per-render cost is one DB read + one cookie
  // read, not one per child.
  const chrome: AppShellChrome = {
    userMenu: {
      account: t("navigation.account"),
      agencySettings: t("navigation.agencySettings"),
      help: t("auth.chrome.userMenu.help"),
      platformAdmin: t("auth.chrome.userMenu.platformAdmin"),
      platformAdminTitle: t("auth.chrome.userMenu.platformAdminTitle"),
      activeAgencyTitle: t("auth.chrome.userMenu.activeAgencyTitle"),
      adminSuffix: t("auth.chrome.userMenu.adminSuffix"),
      menuAriaLabel: t("auth.chrome.userMenu.menuAriaLabel"),
      avatarAriaLabel: t("auth.chrome.userMenu.avatarAriaLabel"),
    },
    notifications: {
      triggerAriaLabel: t("auth.chrome.notifications.triggerAriaLabel"),
      triggerAriaLabelUnread: t("auth.chrome.notifications.triggerAriaLabelUnread"),
      dialogAriaLabel: t("auth.chrome.notifications.dialogAriaLabel"),
      title: t("auth.chrome.notifications.title"),
      markAllRead: t("auth.chrome.notifications.markAllRead"),
      empty: t("auth.chrome.notifications.empty"),
    },
    // Sidebar labels: flat key→string map indexed by the
    // navigation-model spec `key`. The sidebar component
    // resolves each spec's labelKey through this map; missing
    // keys fall through to the English `label` baked into the
    // spec (so the product never goes untranslated for
    // anything the v1 catalog covers).
    sidebar: {
      // Chrome keys (used by SidebarHeader, SidebarFooter, and
      // the aria-labels of groups / badges).
      sidebarAriaLabel: t("sidebar.sidebarAriaLabel"),
      studioFlowHome: t("sidebar.studioFlowHome"),
      agencyLabelFallback: t("sidebar.agencyLabelFallback"),
      createContent: t("sidebar.createContent"),
      pendingBadge: t("sidebar.pendingBadge"),
      collapseGroup: t("sidebar.collapseGroup"),
      expandGroup: t("sidebar.expandGroup"),
      contextLabel: t("sidebar.contextLabel"),
      agencySwitcherActiveAria: t("sidebar.agencySwitcherActiveAria"),
      agencySwitcherSelectAria: t("sidebar.agencySwitcherSelectAria"),
      agencySwitcherSelect: t("sidebar.agencySwitcherSelect"),
      agencySwitcherNoAgenciesAria: t("sidebar.agencySwitcherNoAgenciesAria"),
      agencySwitcherNoAgency: t("sidebar.agencySwitcherNoAgency"),
      agencySwitcherSwitchTitle: t("sidebar.agencySwitcherSwitchTitle"),
      agencySwitcherListAria: t("sidebar.agencySwitcherListAria"),
      agencySwitcherNoAgenciesYet: t("sidebar.agencySwitcherNoAgenciesYet"),
      agencySwitcherCreateNew: t("sidebar.agencySwitcherCreateNew"),
      agencySwitcherAdminLabel: t("sidebar.agencySwitcherAdminLabel"),
      agencySwitcherSwitchNotMember: t("sidebar.agencySwitcherSwitchNotMember"),
      agencySwitcherSessionExpired: t("sidebar.agencySwitcherSessionExpired"),
      agencySwitcherSwitchFailed: t("sidebar.agencySwitcherSwitchFailed"),
      agencySwitcherSwitchFailedShort: t("sidebar.agencySwitcherSwitchFailedShort"),
      workspaceSwitcherActiveAria: t("sidebar.workspaceSwitcherActiveAria"),
      workspaceSwitcherSelectAria: t("sidebar.workspaceSwitcherSelectAria"),
      workspaceSwitcherSelect: t("sidebar.workspaceSwitcherSelect"),
      workspaceSwitcherNoWorkspacesAria: t("sidebar.workspaceSwitcherNoWorkspacesAria"),
      workspaceSwitcherCreateFirst: t("sidebar.workspaceSwitcherCreateFirst"),
      workspaceSwitcherSwitchTitle: t("sidebar.workspaceSwitcherSwitchTitle"),
      workspaceSwitcherListAria: t("sidebar.workspaceSwitcherListAria"),
      workspaceSwitcherNoWorkspacesYet: t("sidebar.workspaceSwitcherNoWorkspacesYet"),
      workspaceSwitcherNew: t("sidebar.workspaceSwitcherNew"),
      workspaceCreate: t("sidebar.workspaceCreate"),
      workspaceSection: t("sidebar.workspaceSection"),
      mobileMore: t("sidebar.mobileMore"),
      mobileMoreAria: t("sidebar.mobileMoreAria"),
      mobileNavigate: t("sidebar.mobileNavigate"),
      mobileGlobalDescription: t("sidebar.mobileGlobalDescription"),
      personal: t("sidebar.personal"),
      account: t("navigation.account"),
      help: t("auth.chrome.userMenu.help"),

      // Workspace navigation (matches the `key` field of each
      // buildWorkspaceNavigation spec).
      "workspace-overview": t("sidebar.workspaceOverview"),
      content: t("sidebar.workspaceContent"),
      planning: t("sidebar.planning"),
      "planning-list": t("sidebar.planningList"),
      "planning-board": t("sidebar.planningBoard"),
      "planning-calendar": t("sidebar.planningCalendar"),
      approvals: t("sidebar.approvals"),
      "design-queue": t("sidebar.designQueue"),
      library: t("sidebar.library"),
      performance: t("sidebar.performance"),
      channels: t("sidebar.channels"),
      analytics: t("sidebar.analytics"),
      brand: t("sidebar.brand"),
      "brand-kit": t("sidebar.brandKit"),
      "brand-overview": t("sidebar.brandOverview"),
      identity: t("sidebar.brandIdentity"),
      logos: t("sidebar.brandLogos"),
      colors: t("sidebar.brandColors"),
      typography: t("sidebar.brandTypography"),
      voice: t("sidebar.brandVoice"),
      "voice-tone": t("sidebar.brandVoiceTone"),
      pillars: t("sidebar.brandPillars"),
      "brand-publishing": t("sidebar.brandPublishing"),
      linked: t("sidebar.brandLinked"),
      "brand-templates": t("sidebar.brandTemplates"),
      manage: t("sidebar.manage"),
      activity: t("sidebar.activity"),
      team: t("sidebar.team"),
      settings: t("sidebar.settings"),
      "settings-lifecycle": t("sidebar.settingsLifecycle"),
      "settings-lead-times": t("sidebar.settingsLeadTimes"),
      "settings-assignment-defaults": t("sidebar.settingsAssignmentDefaults"),
      "settings-approval-mode": t("sidebar.settingsApprovalMode"),
      "settings-ai-assistance": t("sidebar.settingsAiAssistance"),
      "settings-presets": t("sidebar.settingsPresets"),

      // Agency navigation (matches the `key` field of each
      // buildAgencyNavigation spec).
      "my-work": t("sidebar.myWork"),
      agency: t("sidebar.agencyGroup"),
      workspaces: t("sidebar.agencyWorkspaces"),
      admin: t("sidebar.adminGroup"),
      users: t("sidebar.users"),
      "agency-settings": t("sidebar.agencySettings"),
      "agency-settings-general": t("sidebar.settingsGeneral"),
      "agency-settings-plan": t("sidebar.settingsPlan"),
      "agency-settings-ai": t("sidebar.settingsAiConfiguration"),
      "platform-overview": t("sidebar.platformOverview"),
      "platform-agencies": t("sidebar.platformAgencies"),
      "platform-security": t("sidebar.platformSecurity"),
      "platform-access": t("sidebar.platformAccess"),
      "app-errors": t("sidebar.appErrors"),
      platform: t("sidebar.platformGroup"),

      // Client-reviewer navigation (matches the `key` field of
      // each buildClientReviewerNavigation spec).
      "client-review": t("sidebar.clientReview"),
      calendar: t("sidebar.clientCalendar"),
    },
  };

  return (
    <AppShell
      buildInfo={buildInfo}
      user={{
        id: session.user.id,
        name: session.user.name ?? session.user.email ?? "User",
        email: session.user.email ?? "",
        image: session.user.image ?? null,
        isAdmin,
        isPlatformAdmin: platformAdmin,
      }}
      workspaces={switcher.options}
      workspaceAccess={workspaceAccess}
      workspaceCanCreateContent={workspaceCanCreateContent}
      agencySwitcher={{ active: activeAgency, options: agencyOptions }}
      canCreateWorkspace={switcher.isAdmin}
      notifications={notifications.map((n) => {
        // STUDIOFLOW_MASTER_PROMPT.md §1 — Stored system copy.
        // Resolve the row's title/body in the recipient's profile
        // locale when `messageKey` is set; otherwise the stored
        // English fallback is rendered. The bell stays a client
        // component; the server resolves the strings once per
        // request so the client never reaches for the catalog.
        const copy = renderNotificationCopy(n, activeLocale);
        return {
          id: n.id,
          kind: n.kind,
          title: copy.title,
          body: copy.body,
          actionUrl: n.actionUrl,
          readAt: n.readAt ? n.readAt.toISOString() : null,
          createdAt: n.createdAt.toISOString(),
        };
      })}
      unreadCount={unreadCount}
      platformAccess={platformAccess}
      supportGrants={supportGrants}
      workspaceBadges={workspaceBadgesMap}
      unreadAppErrors={globalBadges.unreadAppErrors}
      sidebarCollapsed={sidebarCollapsed}
      chrome={chrome}
    >
      {children}
    </AppShell>
  );
}
