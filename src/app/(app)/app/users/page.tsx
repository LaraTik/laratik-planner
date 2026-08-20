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
import { PageHeader } from "@/components/workspace/page-header";

/**
 * User Management (admin only).
 *  - Active members list
 *  - Pending invitations with resend / revoke
 *  - Send new invitation form
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
        <Link href="/app" className="text-primary inline-block underline-offset-4 hover:underline">
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        description="Invite team members, assign workspace roles, deactivate departures."
      />

      <Card>
        <h2 className="text-title-card text-fg-primary mb-3 font-semibold">Send an invitation</h2>
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
          <CardTitle>Members</CardTitle>
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
