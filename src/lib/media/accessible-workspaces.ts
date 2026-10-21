import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaceMembershipRoles, workspaceMemberships, workspaces } from "@/lib/db/schema";
import { isAgencyAdmin, isAgencyMember, type Actor } from "@/lib/auth/policy";

/** Return the agency workspaces whose media the actor may access. */
export async function accessibleWorkspaceIdsForActor(
  actor: Actor,
  agencyId: string,
): Promise<string[]> {
  if (!(await isAgencyMember(actor, agencyId))) return [];
  if (await isAgencyAdmin(actor, agencyId)) {
    const all = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.agencyId, agencyId));
    return all.map((row) => row.id);
  }
  const rows = await db
    .select({ id: workspaceMemberships.workspaceId })
    .from(workspaceMemberships)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
    .innerJoin(
      workspaceMembershipRoles,
      eq(workspaceMembershipRoles.workspaceMembershipId, workspaceMemberships.id),
    )
    .where(
      and(
        eq(workspaceMemberships.userId, actor.id),
        eq(workspaceMemberships.status, "active"),
        eq(workspaces.agencyId, agencyId),
        eq(workspaces.status, "active"),
        inArray(workspaceMembershipRoles.role, [
          "workspace_manager",
          "content_planner",
          "designer",
          "internal_reviewer",
          "publisher",
        ]),
      ),
    );
  return [...new Set(rows.map((row) => row.id))];
}
