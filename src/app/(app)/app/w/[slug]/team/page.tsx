import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Clock, UserPlus, Users } from "lucide-react";
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
import { EmptyState } from "@/components/feedback/empty-state";
import { IconTile } from "@/components/workspace/icon-button";
import { PageHeader } from "@/components/workspace/page-header";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { MemberEditTrigger } from "./member-edit-trigger";

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
  memberRolesByWorkspace: Record<string, Record<string, string>>;
  allWorkspaces: { id: string; name: string }[];
}): DataTableColumnDef<MemberRow>[] {
  return [
    {
      key: "member",
      header: "Member",
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
      header: "Roles",
      cell: (member) => (
        <div className="flex flex-wrap gap-1">
          {member.isAgencyAdmin ? <Badge variant="info">Agency admin</Badge> : null}
          {member.roles.length === 0 ? (
            <span className="text-fg-muted">&mdash;</span>
          ) : (
            member.roles.map((role) => <Badge key={role}>{ROLE_LABEL[role] ?? role}</Badge>)
          )}
        </div>
      ),
    },
    {
      key: "last-active",
      header: "Last active",
      hideOn: "md",
      cell: (member) =>
        member.status === "active" ? "Active now" : <span className="text-fg-muted">—</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (member) =>
        member.status === "active" ? (
          <Badge variant="success">
            <span className="bg-success h-1.5 w-1.5 rounded-full" aria-hidden="true" />
            Active
          </Badge>
        ) : (
          <Badge variant="danger">
            <span className="bg-danger h-1.5 w-1.5 rounded-full" aria-hidden="true" />
            Inactive
          </Badge>
        ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      cell: (member) => (
        <MemberEditTrigger
          member={{
            id: member.id,
            name: member.name,
            email: member.email,
            isAgencyAdmin: member.isAgencyAdmin,
          }}
          actorId={args.actorId}
          actorIsAgencyAdmin={args.actorIsAgencyAdmin}
          workspaces={args.allWorkspaces.map((w) => ({
            id: w.id,
            name: w.name,
            currentRole: args.memberRolesByWorkspace[member.id]?.[w.id] ?? "",
          }))}
        />
      ),
    },
  ];
}

const ROLE_LABEL: Record<string, string> = {
  workspace_manager: "Workspace Manager",
  content_planner: "Content Planner",
  designer: "Designer",
  internal_reviewer: "Internal Reviewer",
  client_reviewer: "Client Reviewer",
  publisher: "Publisher",
  viewer: "Viewer",
};

/**
 * Team (M3.4) — Stitch-aligned table view of the people who have
 * access to a workspace and their roles.
 *
 * Stitch design (project 5403097764334458790, screen `7ff4ca0d`):
 *   columns: Member | Roles | Last active | Status | Actions
 *   "Invite people" lives in a side drawer; in v1 it deep-links to
 *   /app/users where the invite form already lives.
 *
 * Pending workspace invitations are surfaced inline at the top of the
 * page so the manager can see what's outstanding for *this* workspace.
 */
export default async function WorkspaceTeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const canInvite = await isAgencyAdmin({ id: session.user.id }, workspace.agencyId);

  // Active members (join users + roles)
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

  const members = new Map<
    string,
    { name: string; email: string; status: string; isAgencyAdmin: boolean; roles: string[] }
  >();
  for (const row of memberRows) {
    const member = members.get(row.userId) ?? {
      name: row.name,
      email: row.email,
      status: row.status,
      isAgencyAdmin: Boolean(row.agencyRole),
      roles: [],
    };
    if (row.role) member.roles.push(row.role);
    members.set(row.userId, member);
  }

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

  // All agency workspaces + per-member role map for the Edit drawer.
  // The drawer pre-fills every workspace select, not just the current
  // workspace's role, so managers can adjust access in any workspace
  // from a single team-page row.
  const allWorkspaces = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.agencyId, workspace.agencyId));
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
  const memberRolesByWorkspace: Record<string, Record<string, string>> = {};
  for (const r of roleRows) {
    (memberRolesByWorkspace[r.userId] ??= {})[r.workspaceId] = r.role;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={workspace.name}
        title="Team and access"
        description={
          <>
            People with access to this brand workspace and their exact roles.
            <span className="text-label text-fg-muted border-border bg-surface-subtle ml-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
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
                Invite people
              </Link>
            </Button>
          ) : null
        }
      />

      {pendingInvitations.length ? (
        <Card padding="none" className="overflow-hidden">
          <div className="border-border border-b px-4 py-3">
            <h2 className="text-title-card text-fg-primary font-semibold">Pending invitations</h2>
            <p className="text-label text-fg-muted mt-0.5">
              {pendingInvitations.length} awaiting acceptance
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
                  @
                </IconTile>
                <div className="min-w-0 flex-1">
                  <p className="text-body text-fg-primary font-semibold">{inv.email}</p>
                  <p className="text-label text-fg-muted">
                    Expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <Badge variant="info">{ROLE_LABEL[inv.role] ?? inv.role}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card padding="none" className="overflow-hidden">
        {members.size === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title="No members yet"
              description="Invite agency teammates to give them access to this workspace."
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <DataTable
                data-testid="team-table"
                getRowKey={(m) => m.id}
                getRowTestId={(m) => `team-member-${m.id}`}
                rows={[...members.entries()].map(([id, member]) => ({ id, ...member }))}
                columns={teamColumns({
                  actorId: session.user.id,
                  actorIsAgencyAdmin: canInvite,
                  memberRolesByWorkspace,
                  allWorkspaces,
                })}
              />
            </div>
            <div className="border-border text-label text-fg-secondary flex items-center justify-between border-t px-4 py-3">
              <span>
                Showing {members.size} of {members.size} members
              </span>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
