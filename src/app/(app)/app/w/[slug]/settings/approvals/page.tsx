import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { CheckCircle2 } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { workspaceSettings as workspaceSettingsTable } from "@/lib/db/schema/workspaces";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
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
  const canManage = await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
    "workspace_manager",
  ]);
  const [settings] = await db
    .select()
    .from(workspaceSettingsTable)
    .where(eq(workspaceSettingsTable.workspaceId, workspace.id))
    .limit(1);
  const currentMode = (settings?.approvalMode ?? "simple") as "simple" | "internal_then_client";

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="text-fg-muted h-6 w-6" aria-hidden="true" />
            Approval mode
          </span>
        }
        description="How many approval steps a piece of content needs before publish. Pick the mode that matches how the brand stakeholders actually work."
      />
      <SettingsSectionNav slug={slug} current="approvals" />
      <SettingsHealth slug={slug} section="approvals" metrics={{ mode: currentMode }} />
      <SectionCard
        id="approvals"
        title="Approval workflow"
        fullWidth
        aria-label="Approval workflow"
        data-testid="settings-section-approvals"
      >
        {canManage ? (
          <ApprovalsForm slug={slug} currentMode={currentMode} />
        ) : (
          <p className="text-label text-fg-muted">
            Read-only. Workspace manager access is required to edit these settings.
          </p>
        )}
        <div className="border-border mt-6 border-t pt-4">
          <LastSaved at={settings?.updatedAt ?? null} />
        </div>
      </SectionCard>
    </div>
  );
}
