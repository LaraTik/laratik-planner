import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { CalendarDays } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { workspaceSettings as workspaceSettingsTable } from "@/lib/db/schema/workspaces";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { PageHeader } from "@/components/workspace/page-header";
import { SectionCard } from "@/components/workspace/section-card";
import { SettingsBackLink } from "../_components/settings-back-link";
import { SettingsHealth } from "../_components/settings-health";
import { LifecycleForm } from "../_components/lifecycle-form";

/**
 * /app/w/[slug]/settings/lifecycle — the Lifecycle section page
 * (Settings refactor Phase A).
 *
 * The "Lifecycle" section is the workspace identity for
 * scheduling: timezone + optional monthly content target. Both
 * fields drive every "X days from now" view across the planning
 * surface (calendar, auto-suggest dates, KPI bar).
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
    <div className="space-y-6">
      <SettingsBackLink slug={slug} />
      <PageHeader
        eyebrow="Settings"
        title={
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="text-fg-muted h-6 w-6" aria-hidden="true" />
            Lifecycle
          </span>
        }
        description="The workspace identity for scheduling. The timezone drives the calendar, lead-time math, and every 'X days from now' view; the monthly target is the planning KPI bar's reference."
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
        title="Lifecycle settings"
        fullWidth
        aria-label="Lifecycle settings"
        data-testid="settings-section-lifecycle"
      >
        {canManage ? (
          <LifecycleForm slug={slug} timezone={workspace.timezone} monthlyTarget={monthlyTarget} />
        ) : (
          <p className="text-label text-fg-muted">
            Read-only. Workspace manager access is required to edit these settings.
          </p>
        )}
      </SectionCard>
    </div>
  );
}
