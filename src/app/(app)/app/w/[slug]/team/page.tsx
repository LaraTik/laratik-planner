import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
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
} from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { IconTile } from "@/components/workspace/icon-button";
import { PageHeader } from "@/components/workspace/page-header";
import { isAgencyAdmin } from "@/lib/auth/policy";

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
              <table className="w-full border-collapse text-left" data-testid="team-table">
                <thead>
                  <tr className="bg-surface-subtle border-border border-b">
                    <th className="text-label text-fg-secondary px-4 py-3 font-semibold tracking-wide uppercase">
                      Member
                    </th>
                    <th className="text-label text-fg-secondary px-4 py-3 font-semibold tracking-wide uppercase">
                      Roles
                    </th>
                    <th className="text-label text-fg-secondary hidden px-4 py-3 font-semibold tracking-wide uppercase md:table-cell">
                      Last active
                    </th>
                    <th className="text-label text-fg-secondary px-4 py-3 font-semibold tracking-wide uppercase">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-border text-table-dense divide-y">
                  {[...members.entries()].map(([id, member]) => (
                    <tr
                      key={id}
                      className="hover:bg-surface-subtle transition-colors"
                      data-testid={`team-member-${id}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <IconTile size="md" tone="primary" aria-hidden="true">
                            {member.name.charAt(0).toUpperCase()}
                          </IconTile>
                          <div className="min-w-0">
                            <p className="text-body text-fg-primary font-semibold">{member.name}</p>
                            <p className="text-label text-fg-secondary truncate">{member.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {member.isAgencyAdmin ? <Badge variant="info">Agency admin</Badge> : null}
                          {member.roles.length === 0 ? (
                            <span className="text-fg-muted">&mdash;</span>
                          ) : (
                            member.roles.map((role) => (
                              <Badge key={role}>{ROLE_LABEL[role] ?? role}</Badge>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="text-body text-fg-muted hidden px-4 py-3 md:table-cell">
                        {member.status === "active" ? "Active now" : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {member.status === "active" ? (
                          <Badge variant="success">
                            <span
                              className="bg-success h-1.5 w-1.5 rounded-full"
                              aria-hidden="true"
                            />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="danger">
                            <span
                              className="bg-danger h-1.5 w-1.5 rounded-full"
                              aria-hidden="true"
                            />
                            Inactive
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
