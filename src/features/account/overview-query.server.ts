import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agencyMemberships,
  agencies,
  users,
  workspaceMemberships,
  workspaces,
} from "@/lib/db/schema";

/** Load the account identity and active agency context without returning password material. */
export async function loadAccountOverviewIdentity(userId: string) {
  const [[profileRow], agencyRows] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        displayName: users.displayName,
        image: users.image,
        locale: users.locale,
        themePreference: users.themePreference,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({
        agencyId: agencies.id,
        agencyName: agencies.name,
        isAgencyAdmin: agencyMemberships.isAgencyAdmin,
        workspaceCount: sql<number>`(
          SELECT COUNT(*)::int
          FROM ${workspaceMemberships} wm
          INNER JOIN ${workspaces} w ON w.id = wm.workspace_id
          WHERE wm.user_id = ${agencyMemberships.userId}
            AND wm.status = 'active'
            AND w.agency_id = ${agencyMemberships.agencyId}
        )`,
      })
      .from(agencyMemberships)
      .innerJoin(agencies, eq(agencies.id, agencyMemberships.agencyId))
      .where(and(eq(agencyMemberships.userId, userId), eq(agencyMemberships.status, "active")))
      .orderBy(asc(agencyMemberships.createdAt))
      .limit(50),
  ]);

  if (!profileRow) return { profile: null, hasPassword: null, agencyRows };

  const { passwordHash, ...profile } = profileRow;
  return { profile, hasPassword: Boolean(passwordHash), agencyRows };
}

export type AccountOverviewIdentity = Awaited<ReturnType<typeof loadAccountOverviewIdentity>>;
