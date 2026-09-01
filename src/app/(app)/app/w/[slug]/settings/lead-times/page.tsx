import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Clock } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { workspaceSettings as workspaceSettingsTable } from "@/lib/db/schema/workspaces";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { tForActive } from "@/lib/i18n/t-for-active";
import { PageHeader } from "@/components/workspace/page-header";
import { SectionCard } from "@/components/workspace/section-card";
import { SettingsHealth } from "../_components/settings-health";
import { SettingsSectionNav } from "../_components/settings-section-nav";
import { LastSaved } from "../_components/last-saved";
import { LeadTimeDeadline } from "../_components/lead-time-deadline";
import { LeadTimesForm } from "../_components/lead-times-form";

/**
 * /app/w/[slug]/settings/lead-times — the Lead times section
 * page (Settings refactor Phase A + D).
 */
export default async function SettingsLeadTimesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const { t } = await tForActive();
  const canManage = await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
    "workspace_manager",
  ]);
  const [settings] = await db
    .select()
    .from(workspaceSettingsTable)
    .where(eq(workspaceSettingsTable.workspaceId, workspace.id))
    .limit(1);
  const values = {
    contentApprovalLeadDays: settings?.contentApprovalLeadDays ?? 10,
    designCompleteLeadDays: settings?.designCompleteLeadDays ?? 5,
    creativeApprovalLeadDays: settings?.creativeApprovalLeadDays ?? 2,
    readyToPublishLeadDays: settings?.readyToPublishLeadDays ?? 1,
  };
  const approvalMode = (settings?.approvalMode ?? "simple") as "simple" | "internal_then_client";
  const total = Object.values(values).reduce((sum, n) => sum + n, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Clock className="text-fg-muted h-6 w-6" aria-hidden="true" />
            {t("settings.leadTimes.title")}
          </span>
        }
        description={t("settings.leadTimes.description")}
      />
      <SettingsSectionNav
        slug={slug}
        current="lead-times"
        configured={{ "lead-times": total !== 18 }}
        t={t}
      />
      <SettingsHealth
        slug={slug}
        section="lead-times"
        metrics={{
          total,
          ...values,
        }}
      />
      <SectionCard
        id="lead-times-context"
        title={t("settings.leadTimes.contextTitle")}
        fullWidth
        aria-label={t("settings.leadTimes.contextAria")}
        data-testid="settings-section-lead-times-context"
      >
        <p className="text-body text-fg-secondary mb-3 max-w-3xl">
          {t("settings.leadTimes.contextBody")}
        </p>
        <LeadTimeDeadline totalDays={total} today={new Date()} timezone={workspace.timezone} />
      </SectionCard>
      <SectionCard
        id="lead-times"
        title={t("settings.leadTimes.buffersTitle")}
        fullWidth
        aria-label={t("settings.leadTimes.buffersAria")}
        data-testid="settings-section-lead-times"
      >
        {canManage ? (
          <LeadTimesForm
            slug={slug}
            values={values}
            approvalMode={approvalMode}
            timezone={workspace.timezone}
          />
        ) : (
          <p className="text-label text-fg-muted">{t("settings.leadTimes.readOnly")}</p>
        )}
        <div className="border-border mt-6 border-t pt-4">
          <LastSaved at={settings?.updatedAt ?? null} />
        </div>
      </SectionCard>
    </div>
  );
}
