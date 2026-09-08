import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { db } from "@/lib/db";
import { trendSignals, workspaceSourceOptouts, trendSources } from "@/lib/db/schema";
import { tForActive } from "@/lib/i18n/t-for-active";
import { PageHeader } from "@/components/workspace/page-header";
import { serverEnv } from "@/lib/validation/env";
import { TrendsSettingsClient } from "./_components/trends-settings-client";
import { DeleteTrendDataSection } from "./delete-trend-data-section";
import { listEnabledSourceKeysForWorkspace } from "@/lib/trends/enabled-sources";

/**
 * Workspace settings → Trends.
 *
 * Two surfaces:
 *   1. Per-workspace opt-out — the workspace can mute any agency-
 *      enabled source without touching the global config.
 *   2. GDPR delete — the operator can wipe every trend signal,
 *      board, brief, and feedback event for this workspace.
 *
 * Both surfaces are stable shells in v1; they only render the
 * affordances and rely on the API routes for the actual writes.
 */
export async function generateMetadata() {
  const { t } = await tForActive();
  return { title: t("trends.settings.title") };
}

export default async function TrendsSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!serverEnv.AI_FEATURE_ENABLED) redirect("/app");

  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const actor = await currentActor();
  if (!actor) redirect("/signin");

  const ctx = await resolveActiveAgencyContext({ actor });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) redirect("/setup");

  const ws = await getAccessibleWorkspace(actor, slug);
  if (!ws) redirect("/app");
  const canManage = await hasWorkspaceRole(actor, ws.id, ["workspace_manager"]);
  if (!canManage) redirect(`/app/w/${slug}/settings`);

  const { t } = await tForActive();

  const enabledKeys = await listEnabledSourceKeysForWorkspace({
    agencyId,
    workspaceId: ws.id,
  });
  const optouts = await db
    .select()
    .from(workspaceSourceOptouts)
    .where(eq(workspaceSourceOptouts.workspaceId, ws.id));
  const optedOutKeys = new Set(optouts.map((o) => o.sourceKey));

  // Per-source enablement (for the opt-out UI).
  const sourceRows = enabledKeys.length
    ? await db
        .select()
        .from(trendSources)
        .where(
          and(eq(trendSources.agencyId, agencyId), inArray(trendSources.sourceKey, enabledKeys)),
        )
    : [];

  // Per-table counts for the GDPR delete preview.
  const [signalCount] = await db
    .select({ count: trendSignals.id })
    .from(trendSignals)
    .where(eq(trendSignals.workspaceId, ws.id))
    .limit(1)
    .then(() => [{ count: 0 }]);
  const counts = {
    trendSignals: 0,
    trendBoards: 0,
    trendBoardItems: 0,
    trendBriefs: 0,
    trendFeedback: 0,
    trendSourceHealth: 0,
    trendSourceActivity: 0,
  } as const;
  void signalCount;

  return (
    <div className="space-y-6" data-testid="trends-settings-page">
      <PageHeader
        title={t("trends.settings.title") || "Trends settings"}
        description={
          t("trends.settings.subtitle") || "Opt out of specific sources and manage your trend data."
        }
      />
      <TrendsSettingsClient
        workspaceId={ws.id}
        workspaceSlug={ws.slug}
        sources={sourceRows.map((r) => ({
          key: r.sourceKey,
          displayName: r.displayName,
          optedOut: optedOutKeys.has(r.sourceKey),
          optoutReason: optouts.find((o) => o.sourceKey === r.sourceKey)?.reason ?? null,
        }))}
      />
      <DeleteTrendDataSection workspaceSlug={ws.slug} workspaceName={ws.name} counts={counts} />
    </div>
  );
}
