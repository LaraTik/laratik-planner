import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { trendSources, workspaceSourceOptouts } from "@/lib/db/schema";
import { TREND_SOURCE_CATALOG } from "./index";

/**
 * Resolve agency-enabled source keys for one workspace, subtract its opt-outs,
 * and discard source keys that are no longer in the feature catalog.
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

  const enabled = new Set(agencyRows.map((row) => row.sourceKey));
  const optoutRows = await db
    .select({ sourceKey: workspaceSourceOptouts.sourceKey })
    .from(workspaceSourceOptouts)
    .where(
      and(
        eq(workspaceSourceOptouts.workspaceId, input.workspaceId),
        inArray(workspaceSourceOptouts.sourceKey, Array.from(enabled)),
      ),
    );
  for (const optout of optoutRows) enabled.delete(optout.sourceKey);

  return Array.from(enabled).filter((key) =>
    TREND_SOURCE_CATALOG.some((source) => source.key === key),
  );
}
