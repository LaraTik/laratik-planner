import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaceMembershipRoles, workspaceMemberships, workspaces } from "@/lib/db/schema";
import { isAgencyAdmin, isAgencyMember, type Actor } from "@/lib/auth/policy";

/**
 * Read-side helper: which workspace ids in this agency can the actor
 * see media for?
 *
 * Mirrors the workspace-access predicate inside
 * `src/lib/media/service.ts::accessibleWorkspaceIds` so non-service
 * callers (e.g. the library filters route, which doesn't import the
 * full media service to keep its bundle small) can apply the same
 * rule without round-tripping the service.
 */
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
