import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { CalendarDays } from "lucide-react";
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
import { LifecycleForm } from "../_components/lifecycle-form";

/**
 * /app/w/[slug]/settings/lifecycle — the Lifecycle section page
 * (Settings refactor Phase A + D).
 */
export default async function SettingsLifecyclePage({
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
  const monthlyTarget = settings?.monthlyTarget ?? null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="text-fg-muted h-6 w-6" aria-hidden="true" />
            {t("settings.lifecycle.title")}
          </span>
        }
        description={t("settings.lifecycle.description")}
      />
      <SettingsSectionNav
        slug={slug}
        current="lifecycle"
        configured={{
          lifecycle: !!workspace.timezone && workspace.timezone !== "UTC" && monthlyTarget !== null,
        }}
        t={t}
      />
      <SettingsHealth
        slug={slug}
        section="lifecycle"
        metrics={{
          hasTimezone: !!workspace.timezone,
          hasMonthlyTarget: monthlyTarget !== null,
          monthlyTarget,
        }}
      />
      <SectionCard
        id="lifecycle"
        title={t("settings.lifecycle.cardTitle")}
        fullWidth
        aria-label={t("settings.lifecycle.cardTitle")}
        data-testid="settings-section-lifecycle"
      >
        {canManage ? (
          <LifecycleForm
            slug={slug}
            timezone={workspace.timezone}
            monthlyTarget={monthlyTarget}
            t={t}
          />
        ) : (
          <p className="text-label text-fg-muted">{t("settings.lifecycle.readOnly")}</p>
        )}
        <div className="border-border mt-6 border-t pt-4">
          <LastSaved at={settings?.updatedAt ?? null} />
        </div>
      </SectionCard>
    </div>
  );
}
