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
import { tForActive } from "@/lib/i18n/t-for-active";
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
  const { t } = await tForActive();
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
      label: t("settings.items.lifecycle.label"),
      blurb:
        workspace.timezone && workspace.timezone !== "UTC"
          ? t("settings.items.lifecycle.configuredBlurb", { timezone: workspace.timezone })
          : t("settings.items.lifecycle.unconfiguredBlurb"),
      href: `${wsBase}/lifecycle`,
      configured: !!workspace.timezone && workspace.timezone !== "UTC",
    },
    {
      id: "monthly-target",
      label: t("settings.items.monthlyTarget.label"),
      blurb: values.monthlyTarget
        ? t("settings.items.monthlyTarget.configuredBlurb", { count: values.monthlyTarget })
        : t("settings.items.monthlyTarget.unconfiguredBlurb"),
      href: `${wsBase}/lifecycle`,
      configured: values.monthlyTarget !== null && values.monthlyTarget > 0,
    },
    {
      id: "lead-times",
      label: t("settings.items.leadTimes.label"),
      blurb:
        leadTotal === 18
          ? t("settings.items.leadTimes.configuredBlurb")
          : t("settings.items.leadTimes.unconfiguredBlurb", { count: leadTotal }),
      href: `${wsBase}/lead-times`,
      configured: leadTotal !== 18, // non-default = user has touched it
    },
    {
      id: "defaults",
      label: t("settings.items.defaults.label"),
      blurb:
        defaultsCount === 4
          ? t("settings.items.defaults.configuredBlurb")
          : t("settings.items.defaults.unconfiguredBlurb", { count: defaultsCount }),
      href: `${wsBase}/defaults`,
      configured: defaultsCount === 4,
    },
    {
      id: "approvals",
      label: t("settings.items.approvals.label"),
      blurb: t("settings.items.approvals.configuredBlurb", {
        mode: humanize(values.approvalMode),
      }),
      href: `${wsBase}/approvals`,
      configured: true, // always configured (has a DB default)
    },
  ];

  return (
    <div className="space-y-6" data-testid="settings-overview">
      <PageHeader
        eyebrow={workspace.name}
        title={t("settings.title")}
        description={
          <>
            {t("settings.checklist.blurb")}
            <span className="text-label text-fg-muted border-border bg-surface-subtle ms-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
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
              {t("settings.browsePresets")}
            </a>
          </div>
        }
      />

      <SettingsSetupChecklist items={checklistItems} t={t} />

      <ul
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        data-testid="settings-kpi-grid"
      >
        <KpiCard
          href={`${wsBase}/lifecycle`}
          icon={CalendarDays}
          label={t("settings.kpi.lifecycle")}
          summary={t("settings.kpiSummary.lifecycle", { timezone: workspace.timezone })}
          badge={
            values.monthlyTarget
              ? t("settings.kpiBadge.postsPerMonth", { count: values.monthlyTarget })
              : t("settings.kpiBadge.noTarget")
          }
          testId="settings-kpi-lifecycle"
        />
        <KpiCard
          href={`${wsBase}/lead-times`}
          icon={Clock}
          label={t("settings.kpi.leadTimes")}
          summary={t("settings.kpiSummary.leadTimes", { count: leadTotal })}
          badge={
            leadTotal < 5
              ? t("settings.kpiBadge.short")
              : leadTotal > 30
                ? t("settings.kpiBadge.long")
                : t("settings.kpiBadge.balanced")
          }
          testId="settings-kpi-lead-times"
        />
        <KpiCard
          href={`${wsBase}/defaults`}
          icon={UserCog}
          label={t("settings.kpi.defaults")}
          summary={t("settings.kpiSummary.defaults", { count: defaultsCount })}
          badge={
            defaultsCount === 4 ? t("settings.kpiBadge.complete") : t("settings.kpiBadge.partial")
          }
          testId="settings-kpi-defaults"
        />
        <KpiCard
          href={`${wsBase}/approvals`}
          icon={CheckCircle2}
          label={t("settings.kpi.approvals")}
          summary={t("settings.kpiSummary.approvals", { mode: humanize(values.approvalMode) })}
          badge={
            values.approvalMode === "simple"
              ? t("settings.kpiBadge.oneStep")
              : t("settings.kpiBadge.twoSteps")
          }
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
