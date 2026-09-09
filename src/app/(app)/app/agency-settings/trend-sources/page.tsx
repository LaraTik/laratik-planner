import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { aiFeatureSettings, trendSources, trendSourceHealth } from "@/lib/db/schema";
import { tForActive } from "@/lib/i18n/t-for-active";
import { PageHeader } from "@/components/workspace/page-header";
import { TrendSourcesAdmin } from "./_components/trend-sources-admin";
import { loadEnabledCapabilities } from "@/lib/ai/governance";

/**
 * Agency-admin surface for the Trend Radar source catalog.
 *
 * Renders the full source list (18 entries: free + paid + grey), with
 * per-source enable / configure / disable controls. v1 reflects the
 * latest `trend_source_health` row per source.
 */
export async function generateMetadata() {
  const { t } = await tForActive();
  return { title: t("trends.admin.title") };
}

export default async function TrendSourcesAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const actor = await currentActor();
  if (!actor) redirect("/signin");

  const ctx = await resolveActiveAgencyContext({ actor });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) redirect("/setup");
  const [feature] = await db
    .select({ enabled: aiFeatureSettings.enabled })
    .from(aiFeatureSettings)
    .where(eq(aiFeatureSettings.agencyId, agencyId))
    .limit(1);
  if (!feature?.enabled) redirect("/app/agency-settings/ai");
  if (!(await loadEnabledCapabilities(agencyId)).has("trend_radar"))
    redirect("/app/agency-settings/ai");
  if (!(await isAgencyAdmin(actor, agencyId))) redirect("/app/agency-settings/ai");

  const { t } = await tForActive();

  const sourceRows = await db
    .select()
    .from(trendSources)
    .where(eq(trendSources.agencyId, agencyId))
    .orderBy(desc(trendSources.updatedAt));

  const sourceKeys = sourceRows.map((r) => r.sourceKey);
  const healthRows = sourceKeys.length
    ? await db
        .select()
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

  // Group health by source key (keep the newest row per source).
  const healthByKey = new Map<string, (typeof healthRows)[number]>();
  for (const h of healthRows) {
    if (!healthByKey.has(h.sourceKey)) {
      healthByKey.set(h.sourceKey, h);
    }
  }

  return (
    <div className="space-y-6" data-testid="trend-sources-page">
      <PageHeader
        title={t("trends.admin.title") || "Trend sources"}
        description={
          t("trends.admin.subtitle") ||
          "Manage which sources the agency enables, configure API keys, and acknowledge ToS for grey-area tools."
        }
      />
      <TrendSourcesAdmin
        sources={sourceRows.map((r) => ({
          key: r.sourceKey,
          displayName: r.displayName,
          enabled: r.enabled,
          tier: r.tier as "free" | "paid" | "experimental",
          tosClass: r.tosClass as "clean" | "grey" | "review_required",
          cadence: r.cadenceOverride ?? "—",
          tosAcknowledgedAt: r.tosAcknowledgedAt?.toISOString() ?? null,
          hasApiKey: Boolean(r.apiKeyRef),
        }))}
        health={Array.from(healthByKey.values()).map((h) => ({
          sourceKey: h.sourceKey,
          circuitState: h.circuitState ?? "closed",
          lastSuccessAt: h.lastSuccessAt?.toISOString() ?? null,
          lastError: h.lastError ?? null,
        }))}
      />
    </div>
  );
}
