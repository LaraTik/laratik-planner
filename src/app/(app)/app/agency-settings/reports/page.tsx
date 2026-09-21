import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { socialChannels, workspaces } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { FileText, BarChart3, Lock } from "lucide-react";
import { PageHeader } from "@/components/workspace/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiTile } from "@/components/workspace/kpi-tile";
import { Badge } from "@/components/ui/badge";
import { tForActive } from "@/lib/i18n/t-for-active";
import { ReportBuilder } from "@/app/(app)/app/agency-settings/reports/_components/report-builder";
import { ReportHistoryList } from "@/app/(app)/app/agency-settings/reports/_components/report-history-list";
import { listTemplates, listUpcomingTemplates } from "@/lib/reports/templates";
import { loadIndex } from "@/lib/reports/storage";
import { generateReportAction } from "@/app/(app)/app/agency-settings/reports/actions";

export async function generateMetadata() {
  const { t } = await tForActive();
  return { title: t("reports.title") };
}

export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { t } = await tForActive();
  const actor = { id: session.user.id };
  const ctx = await resolveActiveAgencyContext({ actor: actor });
  if (!ctx) redirect("/setup");
  if (!(await isAgencyAdmin(actor, ctx.agencyId))) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("reports.forbiddenTitle")} description={t("reports.forbiddenBody")} />
      </div>
    );
  }

  const [agencyWorkspaces, agencyChannels, history] = await Promise.all([
    db
      .select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.agencyId, ctx.agencyId)),
    db
      .select({
        id: socialChannels.id,
        name: socialChannels.accountName,
        channelType: socialChannels.platform,
        workspaceId: socialChannels.workspaceId,
      })
      .from(socialChannels)
      .innerJoin(workspaces, eq(workspaces.id, socialChannels.workspaceId))
      .where(eq(workspaces.agencyId, ctx.agencyId)),
    loadIndex(),
  ]);

  const historyForAgency = history.filter((r) => r.agencyId === ctx.agencyId);

  const templates = listTemplates();
  const upcoming = listUpcomingTemplates();

  return (
    <div className="space-y-6" data-testid="reports-root">
      <PageHeader
        eyebrow={t("agencySettings.eyebrow")}
        title={t("reports.title")}
        description={t("reports.description")}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiTile
          icon={<FileText className="h-4 w-4" aria-hidden="true" />}
          label={t("reports.kpiReportsThisAgency")}
          value={historyForAgency.length}
          tone="success"
          data-testid="reports-kpi-count"
        />
        <KpiTile
          icon={<BarChart3 className="h-4 w-4" aria-hidden="true" />}
          label={t("reports.kpiWorkspaces")}
          value={agencyWorkspaces.length}
          data-testid="reports-kpi-workspaces"
        />
        <KpiTile
          icon={<BarChart3 className="h-4 w-4" aria-hidden="true" />}
          label={t("reports.kpiChannels")}
          value={agencyChannels.length}
          data-testid="reports-kpi-channels"
        />
      </div>

      <Card data-testid="reports-builder-card">
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2">
            <FileText className="text-fg-secondary h-4 w-4" aria-hidden="true" />
            {t("reports.builderTitle")}
          </CardTitle>
          <Badge variant="outline">{t("reports.beta")}</Badge>
        </CardHeader>
        <p className="text-label text-fg-muted mb-4">{t("reports.builderBlurb")}</p>
        <ReportBuilder
          templates={templates
            .map((template) => ({
              id: template.id,
              labelKey: `reports.templates.${template.id}.label`,
              labelFallback: template.label,
              blurbKey: `reports.templates.${template.id}.blurb`,
              blurbFallback: template.blurb,
              available: true,
            }))
            .concat(
              upcoming.map((template) => ({
                id: template.id,
                labelKey: `reports.templates.${template.id}.label`,
                labelFallback: template.label,
                blurbKey: `reports.templates.${template.id}.blurb`,
                blurbFallback: template.blurb,
                available: false,
              })),
            )}
          workspaces={agencyWorkspaces.map((w) => ({ id: w.id, name: w.name }))}
          channels={agencyChannels.map((c) => ({
            id: c.id,
            name: c.name,
            channelType: c.channelType,
            workspaceId: c.workspaceId,
          }))}
          generate={generateReportAction}
        />
      </Card>

      <Card data-testid="reports-history-card">
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2">
            <Lock className="text-fg-secondary h-4 w-4" aria-hidden="true" />
            {t("reports.historyTitle")}
          </CardTitle>
          <Badge variant="info">{historyForAgency.length}</Badge>
        </CardHeader>
        <p className="text-label text-fg-muted mb-4">{t("reports.historyBlurb")}</p>
        <ReportHistoryList entries={historyForAgency} translator={t} />
      </Card>
    </div>
  );
}
