import { redirect } from "next/navigation";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { isAgencyAdmin, hasWorkspaceRole } from "@/lib/auth/policy";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { db } from "@/lib/db";
import { trendSignals, workspaceSourceOptouts, trendSourceHealth } from "@/lib/db/schema";
import { tForActive } from "@/lib/i18n/t-for-active";
import { PageHeader } from "@/components/workspace/page-header";
import { serverEnv } from "@/lib/validation/env";
import { loadEnabledCapabilities } from "@/lib/ai/governance";
import { listEnabledSourceKeysForWorkspace } from "@/lib/trends/enabled-sources";
import { TrendsPageClient } from "./_components/trends-page-client";

/**
 * Trend Radar — workspace surface (STUDIOFLOW_MASTER_PROMPT §16).
 *
 * The page is split into 4 planner tabs (Explore / For You / Boards /
 * Briefs) plus a degraded banner for open-circuit sources. v1 ships
 * the Explore tab as the only live surface; the others are stable
 * shells that will fill in over the next sprints.
 *
 * When `AI_FEATURE_ENABLED=false` the page redirects to the
 * workspace overview — the planner surfaces only exist when the
 * flag is on.
 */
export async function generateMetadata() {
  const { t } = await tForActive();
  return { title: t("trends.pageTitle") };
}

export default async function TrendsPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!serverEnv.AI_FEATURE_ENABLED) {
    redirect("/app");
  }

  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const actor = await currentActor();
  if (!actor) redirect("/signin");

  const ctx = await resolveActiveAgencyContext({ actor });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) redirect("/setup");
  const capabilities = await loadEnabledCapabilities(agencyId);
  if (!capabilities.has("trend_radar")) redirect("/app");

  const ws = await getAccessibleWorkspace(actor, slug);
  if (!ws) redirect("/app");
  const canView = await hasWorkspaceRole(actor, ws.id, [
    "workspace_manager",
    "content_planner",
    "content_reviewer",
  ]);
  if (!canView) redirect("/app");

  const isAdmin = await isAgencyAdmin(actor, agencyId);
  const { t } = await tForActive();

  // Enabled sources for this workspace (agency defaults + opt-outs).
  const enabledKeys = await listEnabledSourceKeysForWorkspace({
    agencyId,
    workspaceId: ws.id,
  });

  // Per-source health (degraded / open circuit).
  const healthRows = enabledKeys.length
    ? await db
        .select()
        .from(trendSourceHealth)
        .where(
          and(
            eq(trendSourceHealth.agencyId, agencyId),
            inArray(trendSourceHealth.sourceKey, enabledKeys),
          ),
        )
        .orderBy(desc(trendSourceHealth.checkedAt))
        .limit(50)
    : [];

  // Per-workspace opt-outs (for optout badges on the feed).
  const optouts = await db
    .select()
    .from(workspaceSourceOptouts)
    .where(eq(workspaceSourceOptouts.workspaceId, ws.id));

  // Recent signals (50 newest across enabled sources, scoped to this workspace).
  const signals = enabledKeys.length
    ? await db
        .select()
        .from(trendSignals)
        .where(
          and(
            eq(trendSignals.workspaceId, ws.id),
            inArray(trendSignals.sourceKey, enabledKeys),
            // Expired signals must never be presented as current trends.
            sql`${trendSignals.expiresAt} > now()`,
          ),
        )
        .orderBy(desc(trendSignals.score), desc(trendSignals.fetchedAt))
        .limit(50)
    : [];

  // Show the onboarding wizard the first time the workspace visits
  // the page (no enabled sources).
  const showOnboarding = enabledKeys.length === 0;

  return (
    <div className="space-y-6" data-testid="trends-page">
      <PageHeader
        title={t("trends.title") || "Trends"}
        description={
          t("trends.subtitle") || "Discover what your audience is talking about right now."
        }
      />
      <TrendsPageClient
        workspaceSlug={ws.slug}
        isAdmin={isAdmin}
        enabledKeys={enabledKeys}
        health={healthRows.map((h) => ({
          sourceKey: h.sourceKey,
          circuitState: h.circuitState ?? "closed",
          lastSuccessAt: h.lastSuccessAt?.toISOString() ?? null,
        }))}
        optouts={optouts.map((o) => ({
          sourceKey: o.sourceKey,
          optedOutAt: o.optedOutAt.toISOString(),
          reason: o.reason,
        }))}
        signals={signals.map((s) => ({
          id: s.id,
          sourceKey: s.sourceKey,
          platform: s.platform,
          label: s.label,
          sourceUrl: s.sourceUrl,
          velocity: s.velocity,
          lifecycle: s.lifecycle,
          score: s.score,
          vertical: s.vertical,
          fetchedAt: s.fetchedAt.toISOString(),
        }))}
        showOnboarding={showOnboarding}
      />
    </div>
  );
}
