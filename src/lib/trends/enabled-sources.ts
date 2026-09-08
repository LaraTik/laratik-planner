import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { trendSources, workspaceSourceOptouts } from "@/lib/db/schema";
import { TREND_SOURCE_CATALOG } from "@/lib/trends/source-catalog";

/**
 * Resolve the set of source keys that are enabled for a workspace.
 *
 * Logic:
 *   1. Take the agency's enabled rows from `trend_sources`.
 *   2. Subtract the per-workspace opt-outs from
 *      `workspace_source_optouts`.
 *
 * Returns an empty array when the agency has no enabled sources
 * (the planner surfaces the onboarding wizard in that case).
 */
export async function listEnabledSourceKeysForWorkspace(input: {
  agencyId: string;
  workspaceId: string;
}): Promise<string[]> {
  const agencyRows = await db
    .select({ sourceKey: trendSources.sourceKey })
    .from(trendSources)
    .where(and(eq(trendSources.agencyId, input.agencyId), eq(trendSources.enabled, true)));
  if (agencyRows.length === 0) return [];

  const enabled = new Set(agencyRows.map((r) => r.sourceKey));
  const optoutRows = await db
    .select({ sourceKey: workspaceSourceOptouts.sourceKey })
    .from(workspaceSourceOptouts)
    .where(
      and(
        eq(workspaceSourceOptouts.workspaceId, input.workspaceId),
        inArray(workspaceSourceOptouts.sourceKey, Array.from(enabled)),
      ),
    );
  for (const o of optoutRows) {
    enabled.delete(o.sourceKey);
  }
  return Array.from(enabled).filter((k) => TREND_SOURCE_CATALOG.some((d) => d.key === k));
}
