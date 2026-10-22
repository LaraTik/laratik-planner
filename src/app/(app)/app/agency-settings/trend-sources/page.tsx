import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { aiFeatureSettings } from "@/lib/db/schema";
import { tForActive } from "@/lib/i18n/t-for-active";
import { PageHeader } from "@/components/workspace/page-header";
import { TrendSourcesAdmin } from "./_components/trend-sources-admin";
import { loadEnabledCapabilities } from "@/lib/ai/governance";
import { getTrendSourceAdminView } from "@/features/trends/server";

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

  // Enforce agency-admin access before reading plan or source configuration.
  if (!(await isAgencyAdmin(actor, agencyId))) redirect("/app/agency-settings/ai");

  const [feature] = await db
    .select({ enabled: aiFeatureSettings.enabled })
    .from(aiFeatureSettings)
    .where(eq(aiFeatureSettings.agencyId, agencyId))
    .limit(1);
  if (!feature?.enabled) redirect("/app/agency-settings/ai");
  if (!(await loadEnabledCapabilities(agencyId)).has("trend_radar"))
    redirect("/app/agency-settings/ai");

  const { t } = await tForActive();
  const view = await getTrendSourceAdminView(agencyId);

  return (
    <div className="space-y-6" data-testid="trend-sources-page">
      <PageHeader
        title={t("trends.admin.title") || "Trend sources"}
        description={
          t("trends.admin.subtitle") ||
          "Manage which sources the agency enables, configure API keys, and acknowledge ToS for grey-area tools."
        }
      />
      <TrendSourcesAdmin sources={view.sources} health={view.health} />
    </div>
  );
}
