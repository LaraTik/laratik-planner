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
import { SendInviteForm } from "./send-invite-form";
import { AddDirectlyForm } from "./add-directly-form";
import { InvitationList } from "./invitation-list";
import { MemberList } from "./member-list";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiTile } from "@/components/workspace/kpi-tile";
import { PageHeader } from "@/components/workspace/page-header";
import { Building2, Mail, UserCheck, UserPlus, UserX } from "lucide-react";

/**
 * User Management (admin only) — Stitch-aligned dashboard.
 *
 * Stitch design (project 5403097764334458790, screen `89113980`):
 *   - 3 KPI tiles: Active / Pending / Deactivated
 *   - Tabbed card with two modes: "Send invitation" and "Add directly"
 *   - Pending invitations list
 *   - Members list (with Edit access drawer)
 *
 * v1 (Goal 2.5) ships the tabbed "Add directly" variant of the
 * original card. The KPI tiles + Pending + Members sections are
 * unchanged from the prior release.
 */
export const metadata = { title: "User Management" };

export default async function UsersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  const ctx = await resolveActiveAgencyContext({ actor });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) redirect("/setup");
  if (!(await isAgencyAdmin(actor, agencyId))) {
    return (
      <div className="space-y-4">
        <PageHeader title="Forbidden" description="Only agency admins can manage users." />
        <Link
          href="/app"
          className="text-primary focus-visible:ring-focus-ring inline-block rounded-[var(--radius-control)] px-2 py-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
        >
          ← Back to My Work
        </Link>
      </div>
    );
  }

  const [members, pending, allWorkspaces] = await Promise.all([
    listAgencyMembers(agencyId),
    listInvitations(agencyId),
    db
      .select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces)
      .where(and(eq(workspaces.agencyId, agencyId))),
  ]);

  // Per-invitation workspace role grants so the admin can audit
  // what access a pending invite will grant on accept. Without
  // this, the pending-invitations list only shows the email +
  // expiry + the agency-admin flag, and the admin cannot tell
  // at a glance whether the invitee is going to be added to
  // any workspace.
  const grantsByInvitation = await listInvitationGrants(
    pending.map((i) => i.id),
    agencyId,
  );

  // Per-user, per-workspace role lookup so the Edit drawer can pre-select
  // the current role in each workspace select. Active memberships only —
  // deactivated memberships aren't editable in this surface.
  // Multi-role: a user can hold many roles in the same workspace; we
  // group the rows by (userId, workspaceId) into a `string[]`.
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

  const activeCount = members.filter((m) => m.status === "active").length;
  const deactivatedCount = members.length - activeCount;
  const workspaceList = allWorkspaces.map((w) => ({ id: w.id, name: w.name }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        description="Invite team members, pre-create accounts, assign workspace roles, deactivate departures."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="users-kpi-row">
        <KpiTile
          icon={<UserCheck className="h-4 w-4" aria-hidden="true" />}
          label="Active users"
          value={activeCount}
          tone="success"
        />
        <KpiTile
          icon={<Mail className="h-4 w-4" aria-hidden="true" />}
          label="Pending invitations"
          value={pending.length}
          tone="warning"
        />
        <KpiTile
          icon={<UserX className="h-4 w-4" aria-hidden="true" />}
          label="Deactivated"
          value={deactivatedCount}
        />
      </div>

      <Card data-testid="users-add-card">
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2">
            <UserPlus className="text-fg-secondary h-4 w-4" aria-hidden="true" />
            Add a user
          </CardTitle>
          <Badge variant="outline">Agency admin only</Badge>
        </CardHeader>
        <Tabs defaultValue="invite">
          <TabsList aria-label="Add a user: send an invitation or pre-create an account">
            <TabsTrigger value="invite" data-testid="users-tab-invite">
              <Mail className="mr-1 h-4 w-4" aria-hidden="true" />
              Send invitation
            </TabsTrigger>
            <TabsTrigger value="add" data-testid="users-tab-add">
              <UserPlus className="mr-1 h-4 w-4" aria-hidden="true" />
              Add directly
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
          <CardTitle>Pending invitations</CardTitle>
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
          <CardTitle className="inline-flex items-center gap-2">
            <Building2 className="text-fg-secondary h-4 w-4" aria-hidden="true" />
            Members
          </CardTitle>
          <Badge variant="info">{members.length}</Badge>
        </CardHeader>
        <MemberList
          actorId={session.user.id}
          workspaces={workspaceList}
          rolesByUser={rolesByUser}
          members={members.map((m) => ({
            id: m.userId,
            name: m.name ?? m.email,
            email: m.email,
            isAgencyAdmin: m.isAgencyAdmin,
            status: m.status,
            role: m.role,
            joinedAt: m.joinedAt.toISOString().slice(0, 10),
          }))}
        />
      </Card>
    </div>
  );
}
