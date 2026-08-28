import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { CalendarDays, Clock, CheckCircle2, UserCog, Hash, Sparkles } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { workspaceSettings as workspaceSettingsTable } from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { humanize } from "@/lib/content/status";
import { hasPlatformPermission } from "@/lib/auth/platform-access";
import { getResetAllIdeasCounts, EMPTY_RESET_ALL_COUNTS } from "@/lib/content/reset-all-ideas";
import { PageHeader } from "@/components/workspace/page-header";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { BulkResetSection } from "./bulk-reset-section";
import { SettingsSetupChecklist } from "./_components/settings-setup-checklist";
import { currentActor } from "@/lib/auth/current-actor";

/**
 * Workspace settings overview (Settings refactor Phase A + D).
 *
 * Was a single page with 5 anchor fieldsets (Lifecycle / Lead
 * times / Defaults / Approvals / AI assistance) all sharing
 * the same `workspace_settings` row. Now the per-section pages
 * own their own form + Health card + AI state. This page is the
 * settings LANDING with three sections:
 *
 *  1. Setup checklist (Phase D) — one row per configured-or-not
 *     item, with a progress count and per-row jump to the
 *     matching per-section page. Only shown when at least one
 *     item is unconfigured.
 *  2. KPI grid — 4 cards with a live count or summary per
 *     section. Each card links to the per-section page.
 *  3. Current configuration — read-only list of every value
 *     (the values the KPI grid summarises). Manager-only edit
 *     hint.
 *
 * Plus the platform-only bulk-reset danger zone at the bottom.
 */
export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const actor = await currentActor();
  const [canBulkReset, bulkCounts] = await Promise.all([
    actor ? hasPlatformPermission(actor, "platform.destructive.execute") : Promise.resolve(false),
    actor
      ? getResetAllIdeasCounts(workspace.id, false).catch(() => EMPTY_RESET_ALL_COUNTS)
      : Promise.resolve(EMPTY_RESET_ALL_COUNTS),
  ]);
  const [[settings]] = await Promise.all([
    db
      .select()
      .from(workspaceSettingsTable)
      .where(eq(workspaceSettingsTable.workspaceId, workspace.id))
      .limit(1),
    hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"]),
  ]);
  const values = settings ?? {
    approvalMode: "simple",
    contentApprovalLeadDays: 10,
    designCompleteLeadDays: 5,
    creativeApprovalLeadDays: 2,
    readyToPublishLeadDays: 1,
    monthlyTarget: null,
    defaultDesignerId: null,
    defaultContentReviewerId: null,
    defaultInternalCreativeReviewerId: null,
    defaultClientReviewerId: null,
  };

  const leadTotal =
    values.contentApprovalLeadDays +
    values.designCompleteLeadDays +
    values.creativeApprovalLeadDays +
    values.readyToPublishLeadDays;
  const defaultsCount = [
    values.defaultDesignerId,
    values.defaultContentReviewerId,
    values.defaultInternalCreativeReviewerId,
    values.defaultClientReviewerId,
  ].filter(Boolean).length;

  const wsBase = `/app/w/${slug}/settings`;

  // Phase D — the setup checklist items. Each item carries a
  // configured flag derived from the current values. The
  // component renders nothing when all items are configured
  // (no onboarding noise for a workspace that's already set up).
  const checklistItems = [
    {
      id: "lifecycle",
      label: "Pick a workspace timezone",
      blurb:
        workspace.timezone && workspace.timezone !== "UTC"
          ? `Timezone set to ${workspace.timezone}.`
          : "Defaults to UTC; pick the team's timezone so lead-time math matches the calendar.",
      href: `${wsBase}/lifecycle`,
      configured: !!workspace.timezone && workspace.timezone !== "UTC",
    },
    {
      id: "monthly-target",
      label: "Set a monthly content target",
      blurb: values.monthlyTarget
        ? `Planning target: ${values.monthlyTarget} posts / month.`
        : "The planning KPI bar colours on-track / at-risk / off-track against this number.",
      href: `${wsBase}/lifecycle`,
      configured: values.monthlyTarget !== null && values.monthlyTarget > 0,
    },
    {
      id: "lead-times",
      label: "Tune the lead-time buffers",
      blurb:
        leadTotal === 18
          ? "Lead times are at the 10/5/2/1 default — adjust to match your team's cadence."
          : `Current cycle: ${leadTotal} business days.`,
      href: `${wsBase}/lead-times`,
      configured: leadTotal !== 18, // non-default = user has touched it
    },
    {
      id: "defaults",
      label: "Set default assignees",
      blurb:
        defaultsCount === 4
          ? "All four roles have a default assignee."
          : `${defaultsCount} of 4 roles have a default assignee.`,
      href: `${wsBase}/defaults`,
      configured: defaultsCount === 4,
    },
    {
      id: "approvals",
      label: "Pick an approval mode",
      blurb: `Current: ${humanize(values.approvalMode)}.`,
      href: `${wsBase}/approvals`,
      configured: true, // always configured (has a DB default)
    },
  ];

  return (
    <div className="space-y-6" data-testid="settings-overview">
      <PageHeader
        eyebrow={workspace.name}
        title="Workspace settings"
        description={
          <>
            Defaults reduce setup work while keeping every idea editable.
            <span className="text-label text-fg-muted border-border bg-surface-subtle ml-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {workspace.timezone}
            </span>
          </>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/app/w/${slug}/settings/templates`}
              data-testid="settings-browse-presets"
              className="border-border bg-surface hover:bg-surface-subtle text-body text-fg-primary inline-flex items-center gap-2 rounded-[var(--radius-control)] border px-3 py-2 font-semibold transition-colors"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Browse presets
            </a>
          </div>
        }
      />

      <SettingsSetupChecklist items={checklistItems} />

      <ul
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        data-testid="settings-kpi-grid"
      >
        <KpiCard
          href={`${wsBase}/lifecycle`}
          icon={CalendarDays}
          label="Lifecycle"
          summary={`Timezone: ${workspace.timezone}`}
          badge={values.monthlyTarget ? `${values.monthlyTarget} posts / month` : "No target"}
          testId="settings-kpi-lifecycle"
        />
        <KpiCard
          href={`${wsBase}/lead-times`}
          icon={Clock}
          label="Lead times"
          summary={`${leadTotal} business days end-to-end`}
          badge={leadTotal < 5 ? "Short" : leadTotal > 30 ? "Long" : "Balanced"}
          testId="settings-kpi-lead-times"
        />
        <KpiCard
          href={`${wsBase}/defaults`}
          icon={UserCog}
          label="Default assignments"
          summary={`${defaultsCount} of 4 roles configured`}
          badge={defaultsCount === 4 ? "Complete" : "Partial"}
          testId="settings-kpi-defaults"
        />
        <KpiCard
          href={`${wsBase}/approvals`}
          icon={CheckCircle2}
          label="Approval mode"
          summary={humanize(values.approvalMode)}
          badge={values.approvalMode === "simple" ? "1 step" : "2 steps"}
          testId="settings-kpi-approvals"
        />
      </ul>

      {canBulkReset ? (
        <BulkResetSection workspaceSlug={slug} workspaceName={workspace.name} counts={bulkCounts} />
      ) : null}
    </div>
  );
}

function KpiCard({
  href,
  icon: Icon,
  label,
  summary,
  badge,
  testId,
}: {
  href: string;
  icon: typeof Hash;
  label: string;
  summary: string;
  badge: string;
  testId: string;
}) {
  return (
    <li>
      <a
        href={href}
        data-testid={testId}
        className="border-border bg-surface hover:border-primary hover:bg-surface-subtle flex items-start gap-3 rounded-[var(--radius-card)] border p-4 transition-colors"
      >
        <span
          className="bg-primary-subtle text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)]"
          aria-hidden="true"
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-label text-fg-muted block font-semibold tracking-wide uppercase">
            {label}
          </span>
          <span className="text-section-title text-fg-primary block font-semibold">{summary}</span>
          <span className="text-label text-fg-muted mt-1 block">{badge}</span>
        </span>
      </a>
    </li>
  );
}
