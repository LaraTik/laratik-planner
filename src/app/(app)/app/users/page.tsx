import Link from "next/link";
import { auth } from "@/lib/auth/config";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { currentActor } from "@/lib/auth/current-actor";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { workspaceMembershipRoles, workspaceMemberships, workspaces } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { listAgencyMembers, listInvitationGrants, listInvitations } from "@/lib/auth/invitations";
import { tForActive } from "@/lib/i18n/t-for-active";
import { SendInviteForm } from "./send-invite-form";
import { AddDirectlyForm } from "./add-directly-form";
import { InvitationList } from "./invitation-list";
import { MemberList } from "./member-list";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTableToolbar, FilterChip } from "@/components/ui/data-table-toolbar";
import { ListPagination } from "@/components/ui/list-pagination";
import { KpiTile } from "@/components/workspace/kpi-tile";
import { PageHeader } from "@/components/workspace/page-header";
import { buildListHref, hasActiveFilters, paginate, parseListFilters } from "@/lib/list-page-utils";
import { Filter as FilterIcon, UserCheck, Mail, UserPlus, UserX } from "lucide-react";

/**
 * User Management (admin only) — Stitch-aligned dashboard.
 *
 * Stitch design (project 5403097764334458790, screen `89113980`):
 *   - 3 KPI tiles: Active / Pending / Deactivated
 *   - Tabbed card with two modes: "Send invitation" and "Add directly"
 *   - Pending invitations list
 *   - Members list (with Edit access drawer)
 *
 * Round 1 (Team & Access / ui-ux-pro-max): the members list grew a
 * search + status + role toolbar (URL-driven) and cursor-style
 * pagination. The KPI tiles always reflect the FULL member population,
 * not the filtered page, so they stay stable while filtering.
 */
export async function generateMetadata() {
  const { t } = await tForActive();
  return { title: t("users.title") };
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  const ctx = await resolveActiveAgencyContext({ actor });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) redirect("/setup");
  const { t } = await tForActive();
  if (!(await isAgencyAdmin(actor, agencyId))) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("users.forbiddenTitle")} description={t("users.forbiddenBody")} />
        <Link
          href="/app"
          className="text-primary focus-visible:ring-focus-ring inline-block rounded-[var(--radius-control)] px-2 py-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
        >
          {t("users.backToMyWork")}
        </Link>
      </div>
    );
  }

  const filters = parseListFilters(await searchParams);

  const [membersAll, pending, allWorkspaces] = await Promise.all([
    listAgencyMembers(agencyId, {
      ...(filters.q ? { q: filters.q } : {}),
      ...(filters.status.length > 0 ? { status: filters.status } : {}),
      // No role-chip filter is exposed on this page in v1 — the
      // authoritative agency-admins filter is handled below via the
      // `role` URL param so the toolbar can re-render without it.
      ...(filters.role.includes("agency_admin")
        ? { isAdmin: true }
        : filters.role.includes("non_admin")
          ? { isAdmin: false }
          : {}),
    }),
    listInvitations(agencyId),
    db
      .select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces)
      .where(and(eq(workspaces.agencyId, agencyId))),
  ]);

  // KPI counts from the un-filtered population so the user keeps
  // seeing the same totals while searching.
  const [allForKpi] = await Promise.all([listAgencyMembers(agencyId)]);
  const activeCount = allForKpi.filter((m) => m.status === "active").length;
  const deactivatedCount = allForKpi.length - activeCount;
  const pendingCount = pending.length;
  const workspaceList = allWorkspaces.map((w) => ({ id: w.id, name: w.name }));

  const grantsByInvitation = await listInvitationGrants(
    pending.map((i) => i.id),
    agencyId,
  );

  const memberRows = await db
    .select({
      userId: workspaceMemberships.userId,
      workspaceId: workspaceMemberships.workspaceId,
      role: workspaceMembershipRoles.role,
    })
    .from(workspaceMemberships)
    .innerJoin(
      workspaceMembershipRoles,
      eq(workspaceMembershipRoles.workspaceMembershipId, workspaceMemberships.id),
    )
    .where(
      and(
        inArray(
          workspaceMemberships.workspaceId,
          allWorkspaces.map((w) => w.id),
        ),
        eq(workspaceMemberships.status, "active"),
      ),
    );
  const rolesByUser: Record<string, Record<string, string[]>> = {};
  for (const r of memberRows) {
    const userBucket = (rolesByUser[r.userId] ??= {});
    const wsBucket = (userBucket[r.workspaceId] ??= []);
    if (!wsBucket.includes(r.role)) wsBucket.push(r.role);
  }

  const paginated = paginate(membersAll, filters.page, filters.size);
  const filterActive = hasActiveFilters(filters);
  const basePath = "/app/users";
  const prevHref =
    filters.page > 1
      ? buildListHref({
          basePath,
          current: {
            q: filters.q,
            status: filters.status,
            role: filters.role,
            size: filters.size,
          },
          next: { page: filters.page - 1 },
        })
      : null;
  const nextHref =
    filters.page < paginated.totalPages
      ? buildListHref({
          basePath,
          current: {
            q: filters.q,
            status: filters.status,
            role: filters.role,
            size: filters.size,
          },
          next: { page: filters.page + 1 },
        })
      : null;

  return (
    <div className="space-y-6">
      <PageHeader title={t("users.title")} description={t("users.description")} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="users-kpi-row">
        <KpiTile
          icon={<UserCheck className="h-4 w-4" aria-hidden="true" />}
          label={t("users.kpiActive")}
          value={activeCount}
          tone="success"
        />
        <KpiTile
          icon={<Mail className="h-4 w-4" aria-hidden="true" />}
          label={t("users.kpiPending")}
          value={pendingCount}
          tone="warning"
        />
        <KpiTile
          icon={<UserX className="h-4 w-4" aria-hidden="true" />}
          label={t("users.kpiDeactivated")}
          value={deactivatedCount}
        />
      </div>

      <Card data-testid="users-add-card">
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2">
            <UserPlus className="text-fg-secondary h-4 w-4" aria-hidden="true" />
            {t("users.addUserTitle")}
          </CardTitle>
          <Badge variant="outline">{t("users.adminOnly")}</Badge>
        </CardHeader>
        <Tabs defaultValue="invite">
          <TabsList aria-label={t("users.addAria")}>
            <TabsTrigger value="invite" data-testid="users-tab-invite">
              <Mail className="me-1 h-4 w-4" aria-hidden="true" />
              {t("users.tabInvite")}
            </TabsTrigger>
            <TabsTrigger value="add" data-testid="users-tab-add">
              <UserPlus className="me-1 h-4 w-4" aria-hidden="true" />
              {t("users.tabAdd")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="invite">
            <SendInviteForm workspaces={workspaceList} />
          </TabsContent>
          <TabsContent value="add">
            <AddDirectlyForm workspaces={workspaceList} />
          </TabsContent>
        </Tabs>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("users.pendingTitle")}</CardTitle>
          <Badge variant="info">{pending.length}</Badge>
        </CardHeader>
        <InvitationList
          invitations={pending.map((i) => ({
            id: i.id,
            email: i.email,
            expiresAt: i.expiresAt.toISOString().slice(0, 10),
            grantsAgencyAdmin: i.grantsAgencyAdmin,
            workspaceGrants: grantsByInvitation[i.id] ?? [],
          }))}
        />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("users.membersTitle")}</CardTitle>
          <Badge variant="info">
            {filterActive
              ? t("users.membersFiltered", { count: paginated.total })
              : membersAll.length}
          </Badge>
        </CardHeader>
        <DataTableToolbar
          testIdPrefix="users-toolbar"
          searchPlaceholder={t("users.searchPlaceholder")}
          searchLabel={t("users.searchLabel")}
          defaultSearchValue={filters.q}
          hiddenParams={{
            ...(filters.size !== 50 ? { size: String(filters.size) } : {}),
            ...(filters.status.length > 0 ? { status: filters.status } : {}),
            ...(filters.role.length > 0 ? { role: filters.role } : {}),
          }}
          clearHref={buildListHref({
            basePath,
            current: {
              q: filters.q,
              status: filters.status,
              role: filters.role,
              size: filters.size,
            },
            next: { q: "", status: [], role: [], page: 1, size: 50, clear: true },
          })}
          clearLabel={t("users.searchClear")}
        >
          <FilterIcon
            className="text-fg-muted h-4 w-4"
            aria-hidden={true}
            data-testid="users-toolbar-divider"
          />
          <FilterChip
            name="status"
            value="active"
            selected={filters.status.includes("active")}
            label={t("users.statusActive")}
            testId="users-filter-status-active"
          />
          <FilterChip
            name="status"
            value="deactivated"
            selected={filters.status.includes("deactivated")}
            label={t("users.statusDeactivated")}
            testId="users-filter-status-deactivated"
          />
          <FilterChip
            name="role"
            value="agency_admin"
            selected={filters.role.includes("agency_admin")}
            label={t("users.roleAgencyAdmin")}
            testId="users-filter-role-admin"
          />
          <FilterChip
            name="role"
            value="non_admin"
            selected={filters.role.includes("non_admin")}
            label={t("users.roleNonAdmin")}
            testId="users-filter-role-non-admin"
          />
        </DataTableToolbar>

        <MemberList
          actorId={session.user.id}
          workspaces={workspaceList}
          rolesByUser={rolesByUser}
          members={paginated.rows.map((m) => ({
            id: m.userId,
            name: m.name ?? m.email,
            email: m.email,
            isAgencyAdmin: m.isAgencyAdmin,
            status: m.status,
            role: m.role,
            joinedAt: m.joinedAt.toISOString().slice(0, 10),
          }))}
        />

        <ListPagination
          testId="users-pagination"
          page={paginated.page}
          totalPages={paginated.totalPages}
          total={paginated.total}
          from={paginated.from}
          to={paginated.to}
          prevHref={prevHref}
          nextHref={nextHref}
          counterLabel={t("users.paginationAll", {
            from: paginated.from,
            to: paginated.to,
            total: paginated.total,
          })}
          ariaLabel={t("users.paginationAria")}
          prevLabel={t("users.paginationPrev")}
          nextLabel={t("users.paginationNext")}
          pageIndicator={t("users.paginationPageOf", {
            page: paginated.page,
            total: paginated.totalPages,
          })}
        />
      </Card>
    </div>
  );
}
