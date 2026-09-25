import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Clock, Filter as FilterIcon, Mail, UserPlus, Users } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import {
  agencyMemberships,
  invitations,
  invitationWorkspaceRoles,
  users,
  workspaceMemberships,
  workspaceMembershipRoles,
  workspaces,
} from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { DataTableToolbar, FilterChip } from "@/components/ui/data-table-toolbar";
import { ListPagination } from "@/components/ui/list-pagination";
import { EmptyState } from "@/components/feedback/empty-state";
import { IconTile } from "@/components/workspace/icon-button";
import { PageHeader } from "@/components/workspace/page-header";
import { hasWorkspaceRole, isAgencyAdmin } from "@/lib/auth/policy";
import { tForActive } from "@/lib/i18n/t-for-active";
import { DateFormat, formatDate } from "@/lib/i18n/format-locale";
import { buildListHref, hasActiveFilters, paginate, parseListFilters } from "@/lib/list-page-utils";
import { MemberEditTrigger } from "./member-edit-trigger";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await tForActive();
  return { title: t("sidebar.team") };
}

type MemberRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  isAgencyAdmin: boolean;
  roles: string[];
};

function teamColumns(args: {
  actorId: string;
  actorIsAgencyAdmin: boolean;
  canManageRoles: boolean;
  roleScopeWorkspaceId?: string;
  memberRolesByWorkspace: Record<string, Record<string, string[]>>;
  allWorkspaces: { id: string; name: string }[];
  t: (key: string) => string;
}): DataTableColumnDef<MemberRow>[] {
  return [
    {
      key: "member",
      header: args.t("team.colMember"),
      cell: (member) => (
        <div className="flex items-center gap-3">
          <IconTile size="md" tone="primary" aria-hidden="true">
            {member.name.charAt(0).toUpperCase()}
          </IconTile>
          <div className="min-w-0">
            <p className="text-body text-fg-primary font-semibold">{member.name}</p>
            <p className="text-label text-fg-secondary truncate">{member.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: "roles",
      header: args.t("team.colRoles"),
      cell: (member) => (
        <div className="flex flex-wrap gap-1">
          {member.isAgencyAdmin ? <Badge variant="info">{args.t("team.agencyAdmin")}</Badge> : null}
          {member.roles.length === 0 ? (
            <span className="text-fg-muted">&mdash;</span>
          ) : (
            member.roles.map((role) => (
              <Badge key={role}>{args.t(ROLE_LABEL_KEY[role] ?? role)}</Badge>
            ))
          )}
        </div>
      ),
    },
    {
      key: "last-active",
      header: args.t("team.colLastActive"),
      hideOn: "md",
      cell: (member) =>
        member.status === "active" ? (
          args.t("team.activeNow")
        ) : (
          <span className="text-fg-muted">—</span>
        ),
    },
    {
      key: "status",
      header: args.t("team.colStatus"),
      cell: (member) =>
        member.status === "active" ? (
          <Badge variant="success">
            <span className="bg-success h-1.5 w-1.5 rounded-full" aria-hidden="true" />
            {args.t("team.statusActive")}
          </Badge>
        ) : (
          <Badge variant="danger">
            <span className="bg-danger h-1.5 w-1.5 rounded-full" aria-hidden="true" />
            {args.t("team.statusInactive")}
          </Badge>
        ),
    },
    {
      key: "actions",
      header: <span className="sr-only">{args.t("team.actionsAria")}</span>,
      cell: (member) =>
        args.canManageRoles ? (
          <MemberEditTrigger
            member={{
              id: member.id,
              name: member.name,
              email: member.email,
              isAgencyAdmin: member.isAgencyAdmin,
            }}
            actorId={args.actorId}
            actorIsAgencyAdmin={args.actorIsAgencyAdmin}
            {...(args.roleScopeWorkspaceId
              ? { roleScopeWorkspaceId: args.roleScopeWorkspaceId }
              : {})}
            workspaces={args.allWorkspaces.map((w) => ({
              id: w.id,
              name: w.name,
              currentRoles: args.memberRolesByWorkspace[member.id]?.[w.id] ?? [],
            }))}
          />
        ) : null,
    },
  ];
}

const ROLE_LABEL_KEY: Record<string, string> = {
  workspace_manager: "team.role.workspaceManager",
  content_planner: "team.role.contentPlanner",
  designer: "team.role.designer",
  internal_reviewer: "team.role.internalReviewer",
  client_reviewer: "team.role.clientReviewer",
  publisher: "team.role.publisher",
  viewer: "team.role.viewer",
};

/**
 * The full set of workspace roles surfaced as filter chips.
 * Order matters — the chips render in this order.
 */
const WORKSPACE_ROLES = [
  "workspace_manager",
  "content_planner",
  "designer",
  "internal_reviewer",
  "client_reviewer",
  "publisher",
  "viewer",
] as const;

/**
 * Team (M3.4) — Stitch-aligned table view of the people who have
 * access to a workspace and their roles.
 *
 * Stitch design (project 5403097764334458790, screen `7ff4ca0d`):
 *   columns: Member | Roles | Last active | Status | Actions
 *   "Invite people" lives in a side drawer; in v1 it deep-links to
 *   /app/users where the invite form already lives.
 *
 * Round 1 (Team & Access / ui-ux-pro-max): added URL-driven search +
 * status + role filter chips + pagination. Filter+search happens in
 * memory after the DB join — workspace member lists rarely exceed a
 * few hundred rows; if that ceiling is breached, push the predicates
 * into the `memberRows` query below.
 *
 * Pending workspace invitations are surfaced inline at the top of the
 * page so the manager can see what's outstanding for *this* workspace.
 */
export default async function WorkspaceTeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const { t, code } = await tForActive();
  const actor = { id: session.user.id };
  const actorIsAgencyAdmin = await isAgencyAdmin(actor, workspace.agencyId);
  const canManageRoles =
    actorIsAgencyAdmin || (await hasWorkspaceRole(actor, workspace.id, ["workspace_manager"]));
  const canInvite = actorIsAgencyAdmin;

  const filters = parseListFilters(await searchParams);

  // Active members (join users + roles). Filter is in-memory after the
  // join so the join shape stays trivially auditable.
  const memberRows = await db
    .select({
      membershipId: workspaceMemberships.id,
      status: workspaceMemberships.status,
      userId: users.id,
      name: users.displayName,
      email: users.email,
      role: workspaceMembershipRoles.role,
      agencyRole: agencyMemberships.isAgencyAdmin,
    })
    .from(workspaceMemberships)
    .innerJoin(users, eq(users.id, workspaceMemberships.userId))
    .leftJoin(
      workspaceMembershipRoles,
      eq(workspaceMembershipRoles.workspaceMembershipId, workspaceMemberships.id),
    )
    .leftJoin(
      agencyMemberships,
      and(
        eq(agencyMemberships.userId, users.id),
        eq(agencyMemberships.agencyId, workspace.agencyId),
      ),
    )
    .where(eq(workspaceMemberships.workspaceId, workspace.id));

  const allMembers = new Map<
    string,
    { name: string; email: string; status: string; isAgencyAdmin: boolean; roles: string[] }
  >();
  for (const row of memberRows) {
    const member = allMembers.get(row.userId) ?? {
      name: row.name,
      email: row.email,
      status: row.status,
      isAgencyAdmin: Boolean(row.agencyRole),
      roles: [],
    };
    if (row.role) member.roles.push(row.role);
    allMembers.set(row.userId, member);
  }

  // Free-text + status + role filtering in memory. The role chip
  // matches when the user holds ANY of the requested roles in this
  // workspace.
  const q = filters.q.toLowerCase();
  const filteredByText = Array.from(allMembers.entries()).filter(([, member]) => {
    if (!q) return true;
    return member.name.toLowerCase().includes(q) || member.email.toLowerCase().includes(q);
  });
  const filtered = filteredByText.filter(([, member]) => {
    if (filters.status.length > 0 && !filters.status.includes(member.status)) {
      return false;
    }
    if (filters.role.length > 0) {
      const hasAny = member.roles.some((r) => filters.role.includes(r));
      if (!hasAny) return false;
    }
    return true;
  });
  const sorted = filtered.sort((a, b) =>
    a[1].name.toLowerCase().localeCompare(b[1].name.toLowerCase()),
  );
  const paginatedArr = paginate(sorted, filters.page, filters.size);
  const members = new Map(sorted);

  // Pending invitations for this workspace
  const pendingInvitations = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitationWorkspaceRoles.role,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .innerJoin(invitationWorkspaceRoles, eq(invitationWorkspaceRoles.invitationId, invitations.id))
    .where(
      and(
        eq(invitationWorkspaceRoles.workspaceId, workspace.id),
        eq(invitations.status, "pending"),
      ),
    )
    .orderBy(desc(invitations.createdAt));

  // Agency admins can edit the whole agency from this surface. Workspace
  // managers receive only the current workspace in the drawer, and the
  // server action enforces the same scope independently. Keep the query
  // scoped too so manager pages do not load unrelated workspace roles.
  const allWorkspaces = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(
      actorIsAgencyAdmin
        ? eq(workspaces.agencyId, workspace.agencyId)
        : and(eq(workspaces.agencyId, workspace.agencyId), eq(workspaces.id, workspace.id)),
    );
  const roleRows = await db
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
  const memberRolesByWorkspace: Record<string, Record<string, string[]>> = {};
  for (const r of roleRows) {
    const userBucket = (memberRolesByWorkspace[r.userId] ??= {});
    const wsBucket = (userBucket[r.workspaceId] ??= []);
    if (!wsBucket.includes(r.role)) wsBucket.push(r.role);
  }

  const filterActive = hasActiveFilters(filters);
  const basePath = `/app/w/${workspace.slug}/team`;
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
    filters.page < paginatedArr.totalPages
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
    <div className="space-y-6" data-testid="workspace-team">
      <PageHeader
        eyebrow={workspace.name}
        title={t("team.title")}
        description={
          <>
            {t("team.description")}
            <span className="text-label text-fg-muted border-border bg-surface-subtle ms-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {workspace.timezone}
            </span>
          </>
        }
        action={
          canInvite ? (
            <Button asChild>
              <Link href="/app/users" data-testid="team-invite-cta">
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                {t("team.invitePeople")}
              </Link>
            </Button>
          ) : null
        }
      />

      {pendingInvitations.length ? (
        <Card padding="none" className="overflow-hidden" data-testid="team-pending-card">
          <div className="border-border border-b px-4 py-3">
            <h2 className="text-title-card text-fg-primary font-semibold">
              {t("team.pendingTitle")}
            </h2>
            <p className="text-label text-fg-muted mt-0.5">
              {t("team.pendingAwaiting", { count: pendingInvitations.length })}
            </p>
          </div>
          <ul className="divide-border divide-y">
            {pendingInvitations.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
                data-testid={`team-pending-invitation-${inv.id}`}
              >
                <IconTile size="md" tone="neutral" aria-hidden="true">
                  {/* Mail glyph — pending invitations haven't accepted
                      yet so there's no avatar/initial to render. The
                      Mail icon matches the visual language of every
                      other member row (lucide, same stroke). Was a
                      literal `@` glyph, which the design system audit
                      flagged as the only non-icon character in the
                      component layer. */}
                  <Mail className="h-4 w-4" />
                </IconTile>
                <div className="min-w-0 flex-1">
                  <p className="text-body text-fg-primary font-semibold">{inv.email}</p>
                  <p className="text-label text-fg-muted">
                    {t("team.expiresOn", {
                      date: formatDate(inv.expiresAt, code, DateFormat.short),
                    })}
                  </p>
                </div>
                <Badge variant="info">{t(ROLE_LABEL_KEY[inv.role] ?? inv.role)}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card padding="none" className="overflow-hidden" data-testid="team-members-card">
        <DataTableToolbar
          testIdPrefix="team-toolbar"
          searchPlaceholder={t("team.searchPlaceholder")}
          searchLabel={t("team.searchLabel")}
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
          clearLabel={t("team.searchClear")}
        >
          <FilterIcon className="text-fg-muted h-4 w-4" aria-hidden={true} />
          <FilterChip
            name="status"
            value="active"
            selected={filters.status.includes("active")}
            label={t("team.statusActive")}
            testId="team-filter-status-active"
          />
          <FilterChip
            name="status"
            value="inactive"
            selected={filters.status.includes("inactive")}
            label={t("team.statusInactive")}
            testId="team-filter-status-inactive"
          />
          {WORKSPACE_ROLES.map((role) => (
            <FilterChip
              key={role}
              name="role"
              value={role}
              selected={filters.role.includes(role)}
              label={t(ROLE_LABEL_KEY[role] ?? role)}
              testId={`team-filter-role-${role}`}
            />
          ))}
        </DataTableToolbar>

        {members.size === 0 && !filterActive ? (
          <div className="p-6" data-testid="team-empty-state">
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title={t("team.emptyTitle")}
              description={canInvite ? t("team.adminEmpty") : t("team.memberEmpty")}
            />
          </div>
        ) : members.size === 0 && filterActive ? (
          <div className="p-6" data-testid="team-no-match">
            <EmptyState
              icon={<FilterIcon className="h-8 w-8" aria-hidden={true} />}
              title={t("team.emptyNoMatch")}
              description={t("team.emptyNoMatchBody")}
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <DataTable
                data-testid="team-table"
                getRowKey={(m) => m.id}
                getRowTestId={(m) => `team-member-${m.id}`}
                rows={paginatedArr.rows.map(([id, member]) => ({ id, ...member }))}
                columns={teamColumns({
                  actorId: session.user.id,
                  actorIsAgencyAdmin,
                  canManageRoles,
                  ...(actorIsAgencyAdmin ? {} : { roleScopeWorkspaceId: workspace.id }),
                  memberRolesByWorkspace,
                  allWorkspaces: actorIsAgencyAdmin
                    ? allWorkspaces
                    : allWorkspaces.filter((w) => w.id === workspace.id),
                  t,
                })}
              />
            </div>
            <ListPagination
              testId="team-pagination"
              page={paginatedArr.page}
              totalPages={paginatedArr.totalPages}
              total={paginatedArr.total}
              from={paginatedArr.from}
              to={paginatedArr.to}
              prevHref={prevHref}
              nextHref={nextHref}
              counterLabel={t("team.paginationAll", {
                from: paginatedArr.from,
                to: paginatedArr.to,
                total: paginatedArr.total,
              })}
              ariaLabel={t("team.paginationAria")}
              prevLabel={t("team.paginationPrev")}
              nextLabel={t("team.paginationNext")}
              pageIndicator={t("team.paginationPageOf", {
                page: paginatedArr.page,
                total: paginatedArr.totalPages,
              })}
            />
          </>
        )}
      </Card>
    </div>
  );
}
