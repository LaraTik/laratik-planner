import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Gauge } from "lucide-react";
import { DirAwareArrowLeft } from "@/components/ui/dir-aware-icon";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/workspace/page-header";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { tForActive } from "@/lib/i18n/t-for-active";
import { db } from "@/lib/db";
import { agencyEntitlements, platformPlanTemplates } from "@/lib/db/schema";
import { getUsage } from "@/lib/usage";
import { SupportAccessRequestsCard } from "./support-requests-card";

export async function generateMetadata() {
  const { t } = await tForActive();
  return { title: t("agencyPlan.title") };
}
export const dynamic = "force-dynamic";

export default async function AgencyPlanPage() {
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  const context = await resolveActiveAgencyContext({ actor });
  if (!context) redirect("/setup");
  const { t, code } = await tForActive();
  if (!(await isAgencyAdmin(actor, context.agencyId))) {
    return (
      <div className="space-y-4" data-testid="agency-plan-forbidden">
        <PageHeader title={t("agencyPlan.title")} description={t("agencyPlan.forbiddenBody")} />
        <Link
          href="/app/agency-settings"
          className="text-primary focus-visible:ring-focus-ring inline-flex min-h-[var(--control-touch)] items-center gap-1 rounded-[var(--radius-control)] px-2 py-2 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
        >
          <DirAwareArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("agencyPlan.backToAgencySettings")}
        </Link>
      </div>
    );
  }
  const [entitlement, usage] = await Promise.all([
    db
      .select({
        planName: platformPlanTemplates.name,
        effectiveSince: agencyEntitlements.effectiveSince,
      })
      .from(agencyEntitlements)
      .innerJoin(
        platformPlanTemplates,
        eq(platformPlanTemplates.id, agencyEntitlements.planTemplateId),
      )
      .where(eq(agencyEntitlements.agencyId, context.agencyId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    getUsage(db, context.agencyId),
  ]);
  if (!entitlement)
    return (
      <PageHeader
        title={t("agencyPlan.planNotConfigured")}
        description={t("agencyPlan.planNotConfiguredBody")}
      />
    );

  return (
    <div className="space-y-6" data-testid="agency-plan-settings">
      <PageHeader
        eyebrow={t("agencyPlan.eyebrow")}
        title={t("agencyPlan.title")}
        description={t("agencyPlan.description", { plan: entitlement.planName })}
        action={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <Link
              href="/app/agency-settings"
              className="text-primary focus-visible:ring-focus-ring text-body inline-flex min-h-[var(--control-touch)] items-center gap-1 rounded-[var(--radius-control)] px-2 py-2 font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
            >
              <DirAwareArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t("agencyPlan.backToAgencySettings")}
            </Link>
            <Link
              href={
                "mailto:support@laratik.com" +
                "?subject=" +
                encodeURIComponent(t("agencyPlan.requestSubject")) +
                "&body=" +
                encodeURIComponent(t("agencyPlan.requestBody"))
              }
              className="bg-primary text-primary-foreground text-button focus-visible:ring-focus-ring inline-flex min-h-[var(--control-touch)] items-center justify-center rounded-[var(--radius-control)] px-3 py-2 font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              {t("agencyPlan.requestLimitChange")}
            </Link>
          </div>
        }
      />
      <Card padding="lg" className="space-y-4" data-testid="agency-plan-usage-card">
        <div className="flex items-center gap-2">
          <Gauge className="text-primary h-5 w-5" aria-hidden="true" />
          <CardTitle>{entitlement.planName}</CardTitle>
        </div>
        <CardDescription>
          {t("agencyPlan.effectiveSince", {
            date: new Intl.DateTimeFormat(code, {
              dateStyle: "medium",
              timeZone: "UTC",
              numberingSystem: "latn",
            }).format(entitlement.effectiveSince),
          })}
        </CardDescription>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(usage.thresholds).map(([resource, snapshot]) => (
            <div
              key={resource}
              className="border-border rounded-[var(--radius-control)] border p-3"
            >
              <p className="text-label text-fg-muted">{t(`agencyPlan.resources.${resource}`)}</p>
              <p className="text-title-card text-fg-primary font-semibold">
                {formatNumber(usage.counters[resource] ?? 0, code)} /{" "}
                {snapshot.limit == null
                  ? t("agencyPlan.unlimited")
                  : formatNumber(snapshot.limit, code)}
              </p>
              <Badge
                variant={
                  snapshot.level === "healthy"
                    ? "success"
                    : snapshot.level === "over_limit"
                      ? "danger"
                      : "warning"
                }
              >
                {t(`agencyPlan.levels.${snapshot.level}`)}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
      <Card padding="lg">
        <CardTitle>{t("agencyPlan.howLimitsWork")}</CardTitle>
        <CardDescription className="mt-2">{t("agencyPlan.howLimitsWorkBody")}</CardDescription>
      </Card>

      <SupportAccessRequestsCard agencyId={context.agencyId} />
    </div>
  );
}

function formatNumber(value: number, locale: "en" | "ar") {
  return new Intl.NumberFormat(locale, { numberingSystem: "latn" }).format(value);
}
