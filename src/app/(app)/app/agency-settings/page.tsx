import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, KeyRound, Server, Users2 } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { currentActor } from "@/lib/auth/current-actor";
import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencies, agencyMemberships, workspaces } from "@/lib/db/schema";
import { serverEnv } from "@/lib/validation/env";
import { tForActive } from "@/lib/i18n/t-for-active";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/workspace/page-header";
import { EditAgencyForm } from "@/components/forms/edit-agency-form";

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
  const { t } = await tForActive();
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

  const [[agency], [workspaceCount], [memberCount]] = await Promise.all([
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
  ]);
  if (!agency) redirect("/setup");

  // Pre-compute the managed-services status (read-only display).
  const envEnabled = serverEnv.AI_FEATURE_ENABLED && !!serverEnv.MINIMAX_API_KEY;

  return (
    <div className="space-y-6" data-testid="agency-settings">
      <PageHeader title={t("agencySettings.title")} description={t("agencySettings.description")} />

      <div className="grid gap-4 md:grid-cols-3">
        <Card data-testid="agency-settings-footprint">
          <div className="text-primary mb-2 flex items-center gap-2">
            <Building2 className="h-5 w-5" aria-hidden="true" />
            <CardTitle>{t("agencySettings.footprint")}</CardTitle>
          </div>
          <CardDescription className="mb-4">
            {t("agencySettings.footprintDescription")}
          </CardDescription>
          <dl className="space-y-3">
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

        <Card data-testid="agency-settings-plan-link">
          <div className="text-primary mb-2 flex items-center gap-2">
            <Users2 className="h-5 w-5" aria-hidden="true" />
            <CardTitle>{t("agencySettings.plan")}</CardTitle>
          </div>
          <CardDescription className="mb-4">{t("agencySettings.planDescription")}</CardDescription>
          <Link
            href="/app/agency-settings/plan"
            className="text-primary focus-visible:ring-focus-ring text-body inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
            data-testid="agency-settings-plan-link-anchor"
          >
            {t("agencySettings.openPlan")}
          </Link>
        </Card>

        <Card data-testid="agency-settings-services">
          <div className="text-primary mb-2 flex items-center gap-2">
            <Server className="h-5 w-5" aria-hidden="true" />
            <CardTitle>{t("agencySettings.services")}</CardTitle>
          </div>
          <CardDescription className="mb-4">
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
              enabled={envEnabled}
              testId="agency-service-minimax-ai"
              href="/app/agency-settings/ai"
              t={t}
            />
            <Service
              label={t("agencySettings.serviceSocial")}
              enabled={!!serverEnv.SOCIAL_TOKEN_ENCRYPTION_KEY}
              testId="agency-service-social"
              href="/app/agency-settings/social"
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

      <EditAgencyForm
        initialName={agency.name}
        initialSlug={agency.slug}
        initialLocale={agency.locale}
        initialTimezone={agency.timezone}
      />
    </div>
  );
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
