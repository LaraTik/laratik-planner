import "server-only";
import { count, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencyMemberships, agencies, aiUsageEvents, workspaces } from "@/lib/db/schema";

export type PlatformOverviewKpis = {
  totalAgencies: number;
  totalActiveUsers: number;
  totalWorkspaces: number;
  totalAiCalls: number;
};

export type PlatformOverviewAgency = {
  id: string;
  name: string;
  slug: string;
};

export type PlatformOverviewData = {
  kpis: PlatformOverviewKpis;
  recentAgencies: PlatformOverviewAgency[];
};

/** Load only the aggregate and agency identity data shown by the platform overview. */
export async function loadPlatformOverviewData(): Promise<PlatformOverviewData> {
  const [agencyRow, userRow, workspaceRow, aiRow, recentAgencies] = await Promise.all([
    db.select({ value: count() }).from(agencies),
    db
      .select({ value: sql<number>`count(distinct ${agencyMemberships.userId})` })
      .from(agencyMemberships)
      .where(eq(agencyMemberships.status, "active")),
    db.select({ value: count() }).from(workspaces).where(isNull(workspaces.archivedAt)),
    db.select({ value: count() }).from(aiUsageEvents).where(eq(aiUsageEvents.succeeded, true)),
    db
      .select({ id: agencies.id, name: agencies.name, slug: agencies.slug })
      .from(agencies)
      .orderBy(desc(agencies.createdAt))
      .limit(5),
  ]);

  return {
    kpis: {
      totalAgencies: agencyRow[0]?.value ?? 0,
      totalActiveUsers: userRow[0]?.value ?? 0,
      totalWorkspaces: workspaceRow[0]?.value ?? 0,
      totalAiCalls: aiRow[0]?.value ?? 0,
    },
    recentAgencies,
  };
}
