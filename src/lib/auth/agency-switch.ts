import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaces, workspaceMemberships } from "@/lib/db/schema";
import { isActiveMember, setActiveAgencyCookie } from "@/lib/auth/agency-context";
import { isAgencyAdmin, type Actor } from "@/lib/auth/policy";

export type AgencySwitchOutcome =
  { ok: true; destination: string } | { ok: false; reason: "not-a-member" | "no-secret" };

/** Authorize a switch, set the signed context cookie, and resolve its landing page. */
export async function switchAgencyContext(
  actor: Actor,
  agencyId: string,
): Promise<AgencySwitchOutcome> {
  if (!(await isActiveMember(actor, agencyId))) {
    return { ok: false, reason: "not-a-member" };
  }
  if (!(await setActiveAgencyCookie(actor, agencyId))) {
    return { ok: false, reason: "no-secret" };
  }

  const admin = await isAgencyAdmin(actor, agencyId);
  const memberRows = admin
    ? await db
        .select({ slug: workspaces.slug })
        .from(workspaces)
        .where(and(eq(workspaces.agencyId, agencyId), eq(workspaces.status, "active")))
        .orderBy(asc(workspaces.name))
        .limit(1)
    : await db
        .select({ slug: workspaces.slug })
        .from(workspaceMemberships)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
        .where(
          and(
            eq(workspaceMemberships.userId, actor.id),
            eq(workspaceMemberships.status, "active"),
            eq(workspaces.agencyId, agencyId),
            eq(workspaces.status, "active"),
          ),
        )
        .orderBy(asc(workspaces.name))
        .limit(1);

  return {
    ok: true,
    destination: memberRows.length > 0 ? `/app/w/${memberRows[0]!.slug}` : "/app",
  };
}
