import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Gauge } from "lucide-react";
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

export const metadata = { title: "Plan and usage" };
export const dynamic = "force-dynamic";

export default async function AgencyPlanPage() {
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  const context = await resolveActiveAgencyContext({ actor });
  if (!context) redirect("/setup");
  if (!(await isAgencyAdmin(actor, context.agencyId))) redirect("/app");
  const { t } = await tForActive();
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
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("agencyPlan.eyebrow")}
        title={t("agencyPlan.title")}
        description={t("agencyPlan.description", { plan: entitlement.planName })}
        action={
          <Link
            href={
              "mailto:support@laratik.com" +
              "?subject=" +
              encodeURIComponent(t("agencyPlan.requestSubject")) +
              "&body=" +
              encodeURIComponent(t("agencyPlan.requestBody"))
            }
            className="bg-primary text-primary-foreground text-button rounded-[var(--radius-control)] px-3 py-2 font-semibold"
          >
            {t("agencyPlan.requestLimitChange")}
          </Link>
        }
      />
      <Card padding="lg" className="space-y-4">
        <div className="flex items-center gap-2">
          <Gauge className="text-primary h-5 w-5" aria-hidden="true" />
          <CardTitle>{entitlement.planName}</CardTitle>
        </div>
        <CardDescription>
          {t("agencyPlan.effectiveSince", {
            date: entitlement.effectiveSince.toISOString().slice(0, 10),
          })}
        </CardDescription>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(usage.thresholds).map(([resource, snapshot]) => (
            <div
              key={resource}
              className="border-border rounded-[var(--radius-control)] border p-3"
            >
              <p className="text-label text-fg-muted capitalize">
                {resource.replaceAll("_", " ").replace(":", " · ")}
              </p>
              <p className="text-title-card text-fg-primary font-semibold">
                {(usage.counters[resource] ?? 0).toLocaleString()} /{" "}
                {snapshot.limit?.toLocaleString() ?? t("agencyPlan.unlimited")}
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
                {snapshot.level.replaceAll("_", " ")}
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
