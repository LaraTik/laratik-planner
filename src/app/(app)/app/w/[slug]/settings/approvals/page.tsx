import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { CheckCircle2 } from "lucide-react";
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
import { ApprovalsForm } from "../_components/approvals-form";

/**
 * /app/w/[slug]/settings/approvals — the Approval mode
 * section page (Settings refactor Phase A + D).
 */
export default async function SettingsApprovalsPage({
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
  const currentMode = (settings?.approvalMode ?? "simple") as "simple" | "internal_then_client";
  const leadTimes = {
    contentApprovalLeadDays: settings?.contentApprovalLeadDays ?? 10,
    designCompleteLeadDays: settings?.designCompleteLeadDays ?? 5,
    creativeApprovalLeadDays: settings?.creativeApprovalLeadDays ?? 2,
    readyToPublishLeadDays: settings?.readyToPublishLeadDays ?? 1,
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="text-fg-muted h-6 w-6" aria-hidden="true" />
            {t("settings.approvals.title")}
          </span>
        }
        description={t("settings.approvals.description")}
      />
      <SettingsSectionNav slug={slug} current="approvals" configured={{ approvals: true }} t={t} />
      <SettingsHealth slug={slug} section="approvals" metrics={{ mode: currentMode }} t={t} />
      <SectionCard
        id="approvals"
        title={t("settings.approvals.cardTitle")}
        fullWidth
        aria-label={t("settings.approvals.cardTitle")}
        data-testid="settings-section-approvals"
      >
        {canManage ? (
          <ApprovalsForm slug={slug} currentMode={currentMode} leadTimes={leadTimes} />
        ) : (
          <p className="text-label text-fg-muted">{t("settings.approvals.readOnly")}</p>
        )}
        <div className="border-border mt-6 border-t pt-4">
          <LastSaved at={settings?.updatedAt ?? null} />
        </div>
      </SectionCard>
    </div>
  );
}
