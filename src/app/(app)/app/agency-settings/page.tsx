import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Cloud,
  FileText,
  KeyRound,
  Server,
  Users2,
} from "lucide-react";
import { auth } from "@/lib/auth/config";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { currentActor } from "@/lib/auth/current-actor";
import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencies, agencyMemberships, aiFeatureSettings, workspaces } from "@/lib/db/schema";
import { serverEnv } from "@/lib/validation/env";
import { tForActive } from "@/lib/i18n/t-for-active";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/workspace/page-header";
import { EditAgencyForm } from "@/components/forms/edit-agency-form";
import { getAgencyStorageSummary } from "@/lib/storage/config";
import { getSocialStatus } from "@/lib/social/service";
import { getActiveApiKey } from "@/lib/ai";
import { listInstructionPacks } from "@/lib/ai/instruction-packs";

/**
 * Agency-level identity and operational configuration (M3.4 — agency CRUD).
 *
 * The agency admin can now edit the agency's own identity
 * (name, slug, locale, timezone). The page renders a four-card
 * row: identity (editable for admins), footprint (read-only),
 * plan (read-only, links to /app/agency-settings/plan), and
 * managed services (read-only status board).
 *
 * The non-admin / non-signed-in paths redirect to /signin.
 * Forbidden (signed in, not admin) shows a friendly page with
 * a back link to /app.
 */
export async function generateMetadata() {
  const { t } = await tForActive();
  return { title: t("agencySettings.title") };
}

export default async function AgencySettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  const ctx = await resolveActiveAgencyContext({ actor });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) redirect("/setup");
  const { t, code } = await tForActive();
  const isAdmin = await isAgencyAdmin(actor, agencyId);
  if (!isAdmin) {
    return (
      <div className="space-y-4" data-testid="agency-settings-forbidden">
        <PageHeader
          title={t("agencySettings.forbiddenTitle")}
          description={t("agencySettings.forbiddenBody")}
        />
        <Link
          href="/app"
          className="text-primary focus-visible:ring-focus-ring inline-block rounded-[var(--radius-control)] px-2 py-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
        >
          {t("agencySettings.backToMyWork")}
        </Link>
      </div>
    );
  }

  const [[agency], [workspaceCount], [memberCount], packs] = await Promise.all([
    db
      .select({
        id: agencies.id,
        name: agencies.name,
        slug: agencies.slug,
        locale: agencies.locale,
        timezone: agencies.timezone,
      })
      .from(agencies)
      .where(eq(agencies.id, agencyId))
      .limit(1),
    db.select({ value: count() }).from(workspaces).where(eq(workspaces.agencyId, agencyId)),
    db
      .select({ value: count() })
      .from(agencyMemberships)
      .where(eq(agencyMemberships.agencyId, agencyId)),
    listInstructionPacks(agencyId),
  ]);
  if (!agency) redirect("/setup");

  // Pre-compute the managed-services status (read-only display). These
  // two services are database-backed, so the overview must reflect the
  // agency's actual runtime state rather than a deployment-env guess.
  const [[aiFeature], activeAiKey, storageSummary, socialStatus] = await Promise.all([
    db
      .select({ enabled: aiFeatureSettings.enabled })
      .from(aiFeatureSettings)
      .where(eq(aiFeatureSettings.agencyId, agencyId))
      .limit(1),
    getActiveApiKey(agencyId),
    getAgencyStorageSummary(agencyId),
    getSocialStatus(actor, agencyId),
  ]);
  const aiEnabled = aiFeature?.enabled === true && !!activeAiKey;
  const storageProviderReady =
    storageSummary.providerConfigured &&
    storageSummary.providerEnabled &&
    storageSummary.providerStatus === "healthy";
  const storageReady =
    storageProviderReady && storageSummary.enabled && storageSummary.status === "healthy";
  const storageNeedsAttention = storageSummary.enabled && !storageReady;

  return (
    <div className="space-y-6" data-testid="agency-settings">
      <PageHeader
        eyebrow={t("agencySettings.hubEyebrow")}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {t("agencySettings.title")}
            <Badge variant="primary">{t("agencySettings.hubBadge")}</Badge>
          </span>
        }
        description={t("agencySettings.hubDescription")}
        action={
          <Badge variant="success" className="min-h-[var(--control-touch)] px-3 py-2">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {t("agencySettings.healthOperational")}
          </Badge>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3" aria-label={t("agencySettings.snapshotLabel")}>
        <Card padding="sm" data-testid="agency-settings-footprint">
          <div className="text-primary mb-2 flex items-center gap-2">
            <Building2 className="h-5 w-5" aria-hidden="true" />
            <CardTitle>{t("agencySettings.footprint")}</CardTitle>
          </div>
          <CardDescription className="mb-3">
            {t("agencySettings.footprintDescription")}
          </CardDescription>
          <dl className="grid grid-cols-2 gap-3">
            <Row
              label={t("agencySettings.workspaces")}
              value={String(workspaceCount?.value ?? 0)}
            />
            <Row
              label={t("agencySettings.members")}
              value={String(memberCount?.value ?? 0)}
              href="/app/users"
              testId="agency-settings-members-link"
            />
          </dl>
        </Card>

        <Card padding="sm" data-testid="agency-settings-plan-link">
          <div className="text-primary mb-2 flex items-center gap-2">
            <Users2 className="h-5 w-5" aria-hidden="true" />
            <CardTitle>{t("agencySettings.plan")}</CardTitle>
          </div>
          <CardDescription className="mb-3">{t("agencySettings.planDescription")}</CardDescription>
          <Link
            href="/app/agency-settings/plan"
            className="text-primary focus-visible:ring-focus-ring text-body inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
            data-testid="agency-settings-plan-link-anchor"
          >
            {t("agencySettings.openPlan")}
          </Link>
        </Card>

        <Card padding="sm" data-testid="agency-settings-services">
          <div className="text-primary mb-2 flex items-center gap-2">
            <Server className="h-5 w-5" aria-hidden="true" />
            <CardTitle>{t("agencySettings.services")}</CardTitle>
          </div>
          <CardDescription className="mb-3">
            {t("agencySettings.servicesDescription")}
          </CardDescription>
          <div className="space-y-3">
            <Service
              label={t("agencySettings.serviceGoogle")}
              enabled={!!(serverEnv.GOOGLE_CLIENT_ID && serverEnv.GOOGLE_CLIENT_SECRET)}
              testId="agency-service-google-oauth"
              t={t}
            />
            <Service
              label={t("agencySettings.serviceMagicLink")}
              enabled={!!(serverEnv.SMTP_HOST && serverEnv.SMTP_USER)}
              testId="agency-service-magic-link"
              t={t}
            />
            <Service
              label={t("agencySettings.serviceAi")}
              enabled={aiEnabled}
              testId="agency-service-minimax-ai"
              href="/app/agency-settings/ai"
              t={t}
            />
            <Service
              label={t("agencySettings.serviceSocial")}
              enabled={socialStatus.enabled}
              testId="agency-service-social"
              href="/app/agency-settings/social"
              t={t}
            />
            <Service
              label={t("agencySettings.serviceStorage")}
              enabled={storageReady}
              variant={storageNeedsAttention ? "warning" : undefined}
              testId="agency-service-storage"
              href="/app/agency-settings/storage"
              t={t}
            />
            <Service
              label={t("agencySettings.serviceSentry")}
              enabled={!!serverEnv.SENTRY_DSN}
              // Half-configured: SENTRY_DSN is set but SENTRY_AUTH_TOKEN
              // is not. Sentry still works for error reporting; the
              // token is only needed for sourcemap uploads. Show a
              // warning so the operator knows what's missing.
              variant={serverEnv.SENTRY_DSN && !serverEnv.SENTRY_AUTH_TOKEN ? "warning" : undefined}
              testId="agency-service-sentry"
              t={t}
            />
          </div>
          <p className="text-label text-fg-muted mt-4 flex items-start gap-1.5">
            <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{t("agencySettings.credentialsNote")}</span>
          </p>
        </Card>
      </div>

      <section id="general" aria-labelledby="agency-settings-general-title">
        <EditAgencyForm
          initialName={agency.name}
          initialSlug={agency.slug}
          initialLocale={agency.locale}
          initialTimezone={agency.timezone}
        />
      </section>

      <section id="social" aria-labelledby="agency-settings-social-title">
        <Card padding="lg" data-testid="agency-settings-social-summary">
          <SectionHeading
            icon={<Activity className="h-5 w-5" aria-hidden="true" />}
            title={t("agencySettings.socialTitle")}
            description={t("agencySettings.socialDescription")}
            action={
              <Link
                href="/app/agency-settings/social"
                className="bg-primary text-primary-foreground focus-visible:ring-focus-ring inline-flex min-h-[var(--control-touch)] items-center justify-center gap-1.5 rounded-[var(--radius-control)] px-3 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                {t("agencySettings.manageSocial")}
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            }
            titleId="agency-settings-social-title"
          />
          <div className="bg-surface-subtle mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border p-3">
            <div>
              <p className="text-body text-fg-primary font-semibold">
                {socialStatus.enabled
                  ? t("agencySettings.socialEnabled")
                  : t("agencySettings.socialDisabled")}
              </p>
              <p className="text-label text-fg-secondary mt-1">
                {t("agencySettings.socialConnections", {
                  count: socialStatus.connectionCount,
                })}
              </p>
            </div>
            <Badge variant={socialStatus.enabled ? "success" : "outline"}>
              {socialStatus.enabled
                ? t("agencySettings.serviceConfigured")
                : t("agencySettings.serviceDisabled")}
            </Badge>
          </div>
        </Card>
      </section>

      <section id="storage" aria-labelledby="agency-settings-storage-title">
        <Card padding="lg" data-testid="agency-settings-storage-summary">
          <SectionHeading
            icon={<Cloud className="h-5 w-5" aria-hidden="true" />}
            title={t("agencySettings.storageTitle")}
            description={t("agencySettings.storageDescription")}
            action={
              <Link
                href="/app/agency-settings/storage"
                className="text-primary focus-visible:ring-focus-ring border-border inline-flex min-h-[var(--control-touch)] items-center justify-center gap-1.5 rounded-[var(--radius-control)] border px-3 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                {t("agencySettings.manageStorage")}
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            }
            titleId="agency-settings-storage-title"
          />
          <div className="bg-surface-subtle mt-5 space-y-3 rounded-[var(--radius-control)] border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-body text-fg-primary font-semibold">
                {t("agencySettings.storageUsage", {
                  used: formatBytes(storageSummary.projectedBytes, code),
                })}
              </p>
              <Badge
                variant={storageReady ? "success" : storageNeedsAttention ? "warning" : "outline"}
              >
                {storageReady
                  ? t("storage.healthCheckPassed")
                  : storageNeedsAttention
                    ? t("storage.providerUnavailableShort")
                    : t("storage.notConfiguredShort")}
              </Badge>
            </div>
            <div
              className="bg-surface border-border h-3 overflow-hidden rounded-full border"
              role="progressbar"
              aria-label={t("agencySettings.storageUsageLabel")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(100, Math.round(storageSummary.projectedPercentUsed))}
            >
              <div
                className="bg-primary h-full rounded-full transition-[width]"
                style={{ width: `${Math.min(100, storageSummary.projectedPercentUsed)}%` }}
              />
            </div>
            <p className="text-label text-fg-secondary">
              {storageSummary.quotaBytes == null
                ? t("agencySettings.storageUnlimited")
                : t("agencySettings.storageQuota", {
                    quota: formatBytes(storageSummary.quotaBytes, code),
                  })}
            </p>
          </div>
        </Card>
      </section>

      <section id="planning-packs" aria-labelledby="agency-settings-packs-title">
        <Card padding="lg" data-testid="agency-settings-planning-packs-summary">
          <SectionHeading
            icon={<FileText className="h-5 w-5" aria-hidden="true" />}
            title={t("agencySettings.packsTitle")}
            description={t("agencySettings.packsDescription")}
            action={
              <Link
                href="/app/agency-settings/planning-packs"
                className="text-primary focus-visible:ring-focus-ring border-border inline-flex min-h-[var(--control-touch)] items-center justify-center gap-1.5 rounded-[var(--radius-control)] border px-3 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                {t("agencySettings.managePacks")}
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            }
            titleId="agency-settings-packs-title"
          />
          {packs.length ? (
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {packs.slice(0, 3).map((pack) => (
                <div
                  key={pack.id}
                  className="border-border bg-surface-subtle flex flex-col gap-3 rounded-[var(--radius-control)] border p-4"
                >
                  <Badge variant={pack.status === "published" ? "success" : "outline"}>
                    {t(`planningPacks.status.${pack.status}`)}
                  </Badge>
                  <h3 className="text-body text-fg-primary font-semibold break-words">
                    {pack.name}
                  </h3>
                  <p className="text-label text-fg-muted mt-auto">
                    {t("planningPacks.revision", { revision: pack.revision })}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-body text-fg-muted bg-surface-subtle mt-5 rounded-[var(--radius-control)] border border-dashed p-4">
              {t("planningPacks.empty")}
            </p>
          )}
        </Card>
      </section>
    </div>
  );
}

function SectionHeading({
  icon,
  title,
  description,
  action,
  titleId,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action: ReactNode;
  titleId: string;
}) {
  return (
    <div className="border-border flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="bg-primary-subtle text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)]">
          {icon}
        </span>
        <div className="min-w-0">
          <h2
            id={titleId}
            className="text-section-title text-fg-primary font-semibold text-balance"
          >
            {title}
          </h2>
          <p className="text-label text-fg-secondary mt-1 max-w-3xl text-pretty">{description}</p>
        </div>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function formatBytes(bytes: number, locale: "en" | "ar") {
  if (bytes === 0) return "0 GB";
  const gigabytes = bytes / 1024 ** 3;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1, numberingSystem: "latn" }).format(gigabytes)} GB`;
}

function Row({
  label,
  value,
  href,
  testId,
}: {
  label: string;
  value: string;
  href?: string;
  testId?: string;
}) {
  return (
    <div
      className="border-border flex flex-wrap items-center justify-between gap-2 border-b pb-3 last:border-0 last:pb-0"
      data-testid={testId}
    >
      <dt className="text-body text-fg-secondary">{label}</dt>
      <dd className="text-body text-fg-primary font-semibold break-all">
        {href ? (
          <Link
            href={href}
            className="text-primary focus-visible:ring-focus-ring rounded-[var(--radius-control)] px-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
          >
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function Service({
  label,
  enabled,
  testId,
  href,
  variant,
  t,
}: {
  label: string;
  enabled: boolean;
  testId?: string;
  href?: string;
  // Override the default variant (success for enabled, outline
  // for disabled). The Sentry row uses this to surface a
  // "Partially configured" warning when DSN is set but the
  // auth token is not.
  variant?: "success" | "outline" | "warning" | undefined;
  t: (key: string) => string;
}) {
  const resolvedVariant: "success" | "outline" | "warning" =
    variant ?? (enabled ? "success" : "outline");
  const labelText = !enabled
    ? t("agencySettings.serviceDisabled")
    : resolvedVariant === "warning"
      ? t("agencySettings.servicePartial")
      : t("agencySettings.serviceConfigured");
  const inner = (
    <>
      <span className="text-body text-fg-primary">{label}</span>
      <Badge variant={resolvedVariant}>{labelText}</Badge>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="border-border focus-visible:ring-focus-ring flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border-b pb-3 last:border-0 last:pb-0 hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
        data-testid={testId}
      >
        {inner}
      </Link>
    );
  }
  return (
    <div
      className="border-border flex flex-wrap items-center justify-between gap-2 border-b pb-3 last:border-0 last:pb-0"
      data-testid={testId}
    >
      {inner}
    </div>
  );
}
