import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { users, workspaceMembershipRoles, workspaceMemberships } from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { ScreenHeading } from "@/components/workspace/screen-heading";
import { Badge } from "@/components/ui/badge";

export default async function WorkspaceTeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const rows = await db
    .select({
      membershipId: workspaceMemberships.id,
      status: workspaceMemberships.status,
      userId: users.id,
      name: users.displayName,
      email: users.email,
      role: workspaceMembershipRoles.role,
    })
    .from(workspaceMemberships)
    .innerJoin(users, eq(users.id, workspaceMemberships.userId))
    .leftJoin(
      workspaceMembershipRoles,
      eq(workspaceMembershipRoles.workspaceMembershipId, workspaceMemberships.id),
    )
    .where(eq(workspaceMemberships.workspaceId, workspace.id));
  const members = new Map<
    string,
    { name: string; email: string; status: string; roles: string[] }
  >();
  for (const row of rows) {
    const member = members.get(row.userId) ?? {
      name: row.name,
      email: row.email,
      status: row.status,
      roles: [],
    };
    if (row.role) member.roles.push(row.role);
    members.set(row.userId, member);
  }
  return (
    <div className="space-y-6">
      <ScreenHeading
        eyebrow={workspace.name}
        title="Team and access"
        description="People with access to this brand workspace and their exact roles."
      />
      <div className="border-border bg-surface divide-border divide-y rounded-[var(--radius-card)] border">
        {[...members.entries()].map(([id, member]) => (
          <article key={id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="bg-primary-subtle text-primary flex h-10 w-10 items-center justify-center rounded-full font-semibold">
              {member.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-body text-fg-primary font-semibold">{member.name}</p>
              <p className="text-label text-fg-secondary truncate">{member.email}</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {member.roles.map((role) => (
                <Badge key={role}>{role.replace(/_/g, " ")}</Badge>
              ))}
              <Badge variant={member.status === "active" ? "success" : "danger"}>
                {member.status}
              </Badge>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
