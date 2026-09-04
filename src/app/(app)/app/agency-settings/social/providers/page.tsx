import { redirect } from "next/navigation";
import Link from "next/link";
import { KeyRound, PlugZap } from "lucide-react";
import { DirAwareArrowLeft } from "@/components/ui/dir-aware-icon";
import { auth } from "@/lib/auth/config";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { currentActor } from "@/lib/auth/current-actor";
import { tForActive } from "@/lib/i18n/t-for-active";
import { PageHeader } from "@/components/workspace/page-header";
import { db } from "@/lib/db";
import { agencies, agencySocialProviderConfig } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { ProviderConfigCard } from "./provider-config-card";
import { AnalyticsProbeCard } from "./analytics-probe-card";
import { listAnalyticsProbeProfiles } from "@/lib/social/analytics-probe";

export async function generateMetadata() {
  const { t } = await tForActive();
  return { title: t("agencyProviders.title") };
}

/**
 * M4.6 — per-agency social provider config page.
 *
 * The hard cutover moved META_APP_ID / META_APP_SECRET /
 * META_LOGIN_CONFIG_ID / TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET
 * out of the platform env and into the per-agency
 * `agency_social_provider_config` table. This page is the only
 * surface an agency admin uses to set the row.
 *
 * The page is agency-scoped: it loads the agency's row for each
 * supported provider and renders one card per provider. Each card
 * has its own form (paste app id + app secret + login config id,
 * save) plus a "Test" button that calls `/api/social/providers/test`
 * to verify the credentials without driving the user through the
 * full OAuth flow.
 *
 * Auth: agency admin only. Other roles see a friendly forbidden
 * page with a back link.
 */
export default async function AgencySocialProvidersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  const ctx = await resolveActiveAgencyContext({ actor });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) redirect("/setup");
  const { t } = await tForActive();
  if (!(await isAgencyAdmin(actor, agencyId))) {
    return (
      <div className="space-y-4" data-testid="agency-providers-forbidden">
        <PageHeader
          title={t("agencyProviders.title")}
          description={t("agencyProviders.forbiddenBody")}
        />
        <Link
          href="/app/agency-settings/social"
          className="text-primary focus-visible:ring-focus-ring inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
        >
          <DirAwareArrowLeft className="h-4 w-4" aria-hidden={true} />
          {t("agencyProviders.backToSocial")}
        </Link>
      </div>
    );
  }

  // Load the agency's per-provider rows. Two queries (one per
  // provider) so a partial config (e.g. only Meta, no TikTok) still
  // renders both cards with the missing one showing the empty
  // "Add" state. The form component handles the upsert + remove.
  // The agency slug is loaded alongside because each provider card
  // surfaces the per-agency OAuth callback URL (the value the admin
  // pastes into their Meta / TikTok developer console).
  const [metaRow, tiktokRow, agency, probeProfiles] = await Promise.all([
    db
      .select()
      .from(agencySocialProviderConfig)
      .where(
        and(
          eq(agencySocialProviderConfig.agencyId, agencyId),
          eq(agencySocialProviderConfig.provider, "meta"),
        ),
      )
      .limit(1)
      .then((r) => r[0] ?? null),
    db
      .select()
      .from(agencySocialProviderConfig)
      .where(
        and(
          eq(agencySocialProviderConfig.agencyId, agencyId),
          eq(agencySocialProviderConfig.provider, "tiktok"),
        ),
      )
      .limit(1)
      .then((r) => r[0] ?? null),
    db
      .select({ slug: agencies.slug })
      .from(agencies)
      .where(eq(agencies.id, agencyId))
      .limit(1)
      .then((r) => r[0] ?? null),
    listAnalyticsProbeProfiles(agencyId),
  ]);

  return (
    <div className="space-y-6" data-testid="agency-providers-page">
      <PageHeader
        title={t("agencyProviders.title")}
        description={
          <>
            {t("agencyProviders.description")}
            <span className="text-label text-fg-muted ms-2 inline-flex items-center gap-1">
              <KeyRound className="h-3 w-3" aria-hidden={true} />{" "}
              {t("agencyProviders.sealedAtRest")}
            </span>
          </>
        }
      />

      <section className="space-y-3">
        <header className="flex items-center gap-2">
          <PlugZap className="h-4 w-4" aria-hidden={true} />
          <h2 className="text-title-card text-fg-primary font-semibold">
            {t("agencyProviders.providersHeading")}
          </h2>
        </header>
        <p className="text-body text-fg-secondary">{t("agencyProviders.providersBody")}</p>
        <div className="grid gap-4 md:grid-cols-2">
          <ProviderConfigCard
            provider="meta"
            agencyId={agencyId}
            agencySlug={agency?.slug ?? ""}
            actorId={actor.id}
            existing={metaRow ? toExistingSummary(metaRow) : null}
          />
          <ProviderConfigCard
            provider="tiktok"
            agencyId={agencyId}
            agencySlug={agency?.slug ?? ""}
            actorId={actor.id}
            existing={tiktokRow ? toExistingSummary(tiktokRow) : null}
          />
        </div>
      </section>
      <AnalyticsProbeCard profiles={probeProfiles} />
    </div>
  );
}

type ExistingSummary = {
  appId: string;
  loginConfigId: string | null;
  graphApiVersion: string | null;
  enabled: boolean;
  publishingEnabled: boolean;
  appReviewStatus: "not_requested" | "pending" | "approved" | "rejected";
  businessVerificationStatus: "not_required" | "not_started" | "pending" | "verified" | "rejected";
  lastTestedAt: Date | null;
  lastTestedOk: boolean | null;
  lastTestErrorCode: string | null;
  configuredBy: string;
  updatedAt: Date;
};

function toExistingSummary(row: typeof agencySocialProviderConfig.$inferSelect): ExistingSummary {
  return {
    appId: row.appId,
    loginConfigId: row.loginConfigId,
    graphApiVersion: row.graphApiVersion,
    enabled: row.enabled,
    publishingEnabled: row.publishingEnabled,
    appReviewStatus: row.appReviewStatus as ExistingSummary["appReviewStatus"],
    businessVerificationStatus:
      row.businessVerificationStatus as ExistingSummary["businessVerificationStatus"],
    lastTestedAt: row.lastTestedAt,
    lastTestedOk: row.lastTestedOk,
    lastTestErrorCode: row.lastTestErrorCode,
    configuredBy: row.configuredBy,
    updatedAt: row.updatedAt,
  };
}
