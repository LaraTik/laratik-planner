import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { trendSourceHealth, trendSources, workspaceSourceOptouts } from "@/lib/db/schema";
import { TREND_SOURCE_CATALOG } from "./index";

export type TrendSourceAdminView = {
  sources: Array<{
    key: string;
    displayName: string;
    enabled: boolean;
    tier: "free" | "paid" | "experimental";
    tosClass: "clean" | "grey" | "review_required";
    cadence: string;
    tosAcknowledgedAt: string | null;
    hasApiKey: boolean;
  }>;
  health: Array<{
    sourceKey: string;
    circuitState: string;
    lastSuccessAt: string | null;
  }>;
};

/** Read the agency source settings as a secret-free view model for its admin page. */
export async function getTrendSourceAdminView(agencyId: string): Promise<TrendSourceAdminView> {
  const sourceRows = await db
    .select({
      sourceKey: trendSources.sourceKey,
      displayName: trendSources.displayName,
      enabled: trendSources.enabled,
      tier: trendSources.tier,
      tosClass: trendSources.tosClass,
      cadenceOverride: trendSources.cadenceOverride,
      tosAcknowledgedAt: trendSources.tosAcknowledgedAt,
      apiKeyRef: trendSources.apiKeyRef,
    })
    .from(trendSources)
    .where(eq(trendSources.agencyId, agencyId))
    .orderBy(desc(trendSources.updatedAt));

  const sourceKeys = sourceRows.map((row) => row.sourceKey);
  const healthRows = sourceKeys.length
    ? await db
        .select({
          sourceKey: trendSourceHealth.sourceKey,
          circuitState: trendSourceHealth.circuitState,
          lastSuccessAt: trendSourceHealth.lastSuccessAt,
        })
        .from(trendSourceHealth)
        .where(
          and(
            eq(trendSourceHealth.agencyId, agencyId),
            inArray(trendSourceHealth.sourceKey, sourceKeys),
          ),
        )
        .orderBy(desc(trendSourceHealth.checkedAt))
        .limit(100)
    : [];

  return {
    sources: sourceRows.map((row) => ({
      key: row.sourceKey,
      displayName: row.displayName,
      enabled: row.enabled,
      tier: row.tier as TrendSourceAdminView["sources"][number]["tier"],
      tosClass: row.tosClass as TrendSourceAdminView["sources"][number]["tosClass"],
      cadence: row.cadenceOverride ?? "—",
      tosAcknowledgedAt: row.tosAcknowledgedAt?.toISOString() ?? null,
      hasApiKey: Boolean(row.apiKeyRef),
    })),
    health: healthRows.map((row) => ({
      sourceKey: row.sourceKey,
      circuitState: row.circuitState ?? "closed",
      lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
    })),
  };
}

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
