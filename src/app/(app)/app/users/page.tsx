import Link from "next/link";
import { auth } from "@/lib/auth/config";
import { activeAgencyId, isAgencyAdmin } from "@/lib/auth/policy";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { listAgencyMembers, listInvitations } from "@/lib/auth/invitations";
import { SendInviteForm } from "./send-invite-form";
import { InvitationList } from "./invitation-list";
import { MemberList } from "./member-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiTile } from "@/components/workspace/kpi-tile";
import { PageHeader } from "@/components/workspace/page-header";
import { Building2, Mail, UserCheck, UserX } from "lucide-react";

/**
 * User Management (admin only) — Stitch-aligned dashboard.
 *
 * Stitch design (project 5403097764334458790, screen `89113980`):
 *   - 3 KPI tiles: Active / Pending / Deactivated
 *   - Tabbed table (All users / Pending / Deactivated)
 *   - Side drawer for "Edit access"
 *
 * v1 ships the KPI tiles plus the existing three sections (send
 * invitation / pending invitations / members). The tabbed table is a
 * follow-up that re-uses the same MemberList + InvitationList with a
 * client-side filter.
 */
export const metadata = { title: "User Management" };

export default async function UsersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const agencyId = await activeAgencyId();
  if (!agencyId) redirect("/setup");
  if (!(await isAgencyAdmin({ id: session.user.id }, agencyId))) {
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
    listAgencyMembers(),
    listInvitations(),
    db
      .select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces)
      .where(and(eq(workspaces.agencyId, agencyId))),
  ]);

  const activeCount = members.filter((m) => m.status === "active").length;
  const deactivatedCount = members.length - activeCount;

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        description="Invite team members, assign workspace roles, deactivate departures."
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

      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2">
            <Mail className="text-fg-secondary h-4 w-4" aria-hidden="true" />
            Send an invitation
          </CardTitle>
          <Badge variant="outline">Agency admin only</Badge>
        </CardHeader>
        <SendInviteForm workspaces={allWorkspaces.map((w) => ({ id: w.id, name: w.name }))} />
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
