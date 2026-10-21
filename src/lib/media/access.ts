import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { isAgencyAdmin, type Actor } from "@/lib/auth/policy";
import { workspaceMembershipRoles, workspaceMemberships, workspaces } from "@/lib/db/schema";

export const MEDIA_READ_ROLES = [
  "workspace_manager",
  "content_planner",
  "designer",
  "internal_reviewer",
  "publisher",
] as const;

export async function accessibleMediaWorkspaceIds(actor: Actor, agencyId: string) {
  if (await isAgencyAdmin(actor, agencyId)) {
    const rows = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.agencyId, agencyId));
    return rows.map((row) => row.id);
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
        inArray(workspaceMembershipRoles.role, [...MEDIA_READ_ROLES]),
      ),
    );
  return [...new Set(rows.map((row) => row.id))];
}
