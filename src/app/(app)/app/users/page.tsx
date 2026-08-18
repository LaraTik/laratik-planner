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
        <h1 className="text-title-page text-fg-primary font-semibold">Forbidden</h1>
        <p className="text-body text-fg-secondary">Only agency admins can manage users.</p>
        <Link href="/app" className="text-primary underline-offset-4 hover:underline">
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
      <header>
        <h1 className="text-title-page text-fg-primary font-semibold">User Management</h1>
        <p className="text-body text-fg-secondary mt-1">
          Invite team members, assign workspace roles, deactivate departures.
        </p>
      </header>

      <section className="border-border bg-surface rounded-[var(--radius-card)] border p-5">
        <h2 className="text-title-card text-fg-primary mb-3 font-semibold">Send an invitation</h2>
        <SendInviteForm workspaces={allWorkspaces.map((w) => ({ id: w.id, name: w.name }))} />
      </section>

      <section className="border-border bg-surface rounded-[var(--radius-card)] border p-5">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-title-card text-fg-primary font-semibold">Pending invitations</h2>
          <Badge variant="info">{pending.length}</Badge>
        </header>
        <InvitationList
          invitations={pending.map((i) => ({
            id: i.id,
            email: i.email,
            expiresAt: i.expiresAt.toISOString().slice(0, 10),
            grantsAgencyAdmin: i.grantsAgencyAdmin,
          }))}
        />
      </section>

      <section className="border-border bg-surface rounded-[var(--radius-card)] border p-5">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-title-card text-fg-primary font-semibold">Members</h2>
          <Badge variant="info">{members.length}</Badge>
        </header>
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
      </section>
    </div>
  );
}
