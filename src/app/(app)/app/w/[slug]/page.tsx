import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq, gte, isNull, lt } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import {
  contentItems,
  researchBookmarks,
  researchWatchlistAccounts,
  users,
  workspaceMemberships,
  workspaceSettings,
} from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Clock, ListChecks, Plus } from "lucide-react";
import { DirAwareChevronLeft, DirAwareChevronRight } from "@/components/ui/dir-aware-icon";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { PageHeader } from "@/components/workspace/page-header";
import { PlanCoverageCard } from "@/components/workspace/plan-coverage-card";
import { DeliveryHealthCard } from "@/components/workspace/delivery-health-card";
import { WorkflowPipeline } from "@/components/workspace/workflow-pipeline";
import { NeedsAttentionList } from "@/components/workspace/needs-attention-list";
import { RecentlyUpdatedList } from "@/components/workspace/recently-updated-list";
import { AttentionBanner } from "@/components/workspace/attention-banner";
import { OverviewKpiStrip, OVERVIEW_KPI_ICONS } from "@/components/workspace/overview-kpi-strip";
import { CommandCenterPanel } from "@/components/workspace/command-center-panel";
import { calculateOverviewDashboardMetrics } from "@/lib/dashboard/kpis";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { tForActive } from "@/lib/i18n/t-for-active";
import { formatDate } from "@/lib/i18n/format-locale";
import { querySocialAnalytics, querySocialPostObservations } from "@/lib/social/analytics-query";
import { buildCommandCenterSummary } from "@/lib/social/command-center";
import type { SocialSourceMetadata } from "@/lib/social/metrics";

/**
 * Workspace Overview — refactored dashboard (ADR-0007).
 *
 * The pre-refactor page had five loud problems:
 *   1. The donut was labelled "4% AT RISK" while the at-risk count
 *      next to it was 23/27 (≈ 85%). Two contradictory numbers
 *      fighting for the same headline. (Root cause: the donut
 *      math was actually `completed / total` — a "% complete"
 *      value wearing the wrong label.)
 *   2. The Status Pipeline was a row of 8 stat cards (one per
 *      status), including a "Total" tile that is not a workflow
 *      state. It read as a column of numbers, not a flow.
 *   3. Plan Coverage showed "27 / — items · No target" — the
 *      "no target" state was passive metadata, not an action.
 *   4. The Recent items panel was too narrow and only showed a
 *      date + status — no format, no owner, no width.
 *   5. The page used only the central third of a wide desktop
 *      viewport, leaving large unused horizontal space.
 *
 * The refactor (ADR-0007) restructures the page around a single
 * operational story:
 *
 *   "How much have we planned? → Are we healthy? → Where is work
 *    stuck? → Why is it at risk? → What needs my action?"
 *
 * Layout (top to bottom):
 *   1. Attention banner (auto-hide when nothing needs attention)
 *   2. Page header (workspace + month selector + actions)
 *   3. KPI strip (5 compact clickable tiles)
 *   4. Plan Coverage + Delivery Health (50/50 on desktop)
 *   5. Workflow Pipeline (4-stage horizontal flow)
 *   6. Needs Attention + Recently Updated (60/40 on desktop)
 *
 * Metric definitions (ADR-0007) live in
 * `src/lib/dashboard/kpis.ts::calculateOverviewDashboardMetrics`.
 * The stacked-bar segments and the per-bucket counts share one
 * source of truth and are guaranteed to sum to 100% / total.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { t } = await tForActive();
  const { slug } = await params;
  return { title: `${slug} — ${t("workspaceOverview.title")}` };
}

export default async function WorkspaceOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ month?: string; socialWindow?: string }>;
}) {
  const { t, code } = await tForActive();
  const { slug } = await params;
  const filters = await searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const ws = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!ws) notFound();
  const [canSaveResearch, canRefreshSocial] = await Promise.all([
    hasWorkspaceRole({ id: session.user.id }, ws.id, ["workspace_manager", "content_planner"]),
    hasWorkspaceRole({ id: session.user.id }, ws.id, ["workspace_manager"]),
  ]);
  const socialWindowDays: 30 | 90 = filters.socialWindow === "90" ? 90 : 30;

  // Month selection. The dashboard anchors every metric to a
  // single month (per master prompt §22 "Month consistency").
  // The page also supports a "previous / next" period selector
  // via `?month=YYYY-MM`. Without a `month` param, we use the
  // workspace's current month in its own timezone.
  const zonedNow = toZonedTime(new Date(), ws.timezone);
  const monthMatch = filters.month?.match(/^(\d{4})-(\d{2})$/);
  const activeMonth = monthMatch
    ? new Date(Number(monthMatch[1]), Number(monthMatch[2]) - 1, 1)
    : new Date(zonedNow.getFullYear(), zonedNow.getMonth(), 1);

  const year = activeMonth.getFullYear();
  const month = activeMonth.getMonth();
  const monthStart = fromZonedTime(new Date(year, month, 1, 0, 0, 0), ws.timezone);
  const monthEnd = fromZonedTime(new Date(year, month + 1, 1, 0, 0, 0), ws.timezone);
  const monthLabel = formatDate(activeMonth, code, { month: "long", year: "numeric" });
  const now = new Date();

  // Single SQL: pull the dashboard items + the workspace owner's
  // display name (for the needs-attention list) + workspace
  // settings (for the monthly target). The list-safe rollup
  // operates on whatever rows the SQL returns — no N+1 readiness
  // call per item.
  const [
    monthlyItems,
    settings,
    ownerRows,
    approvalRows,
    socialAnalytics,
    socialPostObservations,
    researchBookmarkRows,
    watchlistRows,
  ] = await Promise.all([
    db
      .select({
        id: contentItems.id,
        title: contentItems.title,
        status: contentItems.status,
        format: contentItems.format,
        plannedPublishAt: contentItems.plannedPublishAt,
        // P3.1 — the "Recently updated" panel now sorts by
        // `updatedAt` instead of `plannedPublishAt`. The old
        // sort made the panel's name a lie.
        updatedAt: contentItems.updatedAt,
        contentOwnerId: contentItems.contentOwnerId,
      })
      .from(contentItems)
      .where(
        and(
          eq(contentItems.workspaceId, ws.id),
          isNull(contentItems.archivedAt),
          gte(contentItems.plannedPublishAt, monthStart),
          lt(contentItems.plannedPublishAt, monthEnd),
        ),
      ),
    db.select().from(workspaceSettings).where(eq(workspaceSettings.workspaceId, ws.id)).limit(1),
    db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .innerJoin(workspaceMemberships, eq(workspaceMemberships.userId, users.id))
      .where(eq(workspaceMemberships.workspaceId, ws.id))
      .orderBy(asc(users.displayName)),
    // Content-review approvals waiting for the current reviewer. The
    // status guard keeps resolved items out of the attention banner;
    // the banner links to the dedicated /reviews surface.
    db
      .select({ id: contentItems.id })
      .from(contentItems)
      .where(
        and(
          eq(contentItems.workspaceId, ws.id),
          isNull(contentItems.archivedAt),
          eq(contentItems.status, "content_review"),
          eq(contentItems.contentReviewerId, session.user.id),
        ),
      )
      .limit(50),
    querySocialAnalytics(db, ws.id, ws.timezone, now, socialWindowDays),
    querySocialPostObservations(db, ws.id, ws.timezone, now, socialWindowDays),
    db
      .select({ observationId: researchBookmarks.socialPostObservationId })
      .from(researchBookmarks)
      .where(eq(researchBookmarks.workspaceId, ws.id)),
    db
      .select({
        id: researchWatchlistAccounts.id,
        platform: researchWatchlistAccounts.platform,
        handle: researchWatchlistAccounts.handle,
        displayName: researchWatchlistAccounts.displayName,
        sourceUrl: researchWatchlistAccounts.sourceUrl,
        providerStatus: researchWatchlistAccounts.providerStatus,
      })
      .from(researchWatchlistAccounts)
      .where(
        and(
          eq(researchWatchlistAccounts.workspaceId, ws.id),
          isNull(researchWatchlistAccounts.archivedAt),
        ),
      )
      .orderBy(asc(researchWatchlistAccounts.createdAt))
      .limit(6),
  ]);

  const ownerById = new Map(ownerRows.map((o) => [o.id, o.displayName]));

  const dashboardItems = monthlyItems.map((i) => ({
    id: i.id,
    title: i.title,
    status: i.status,
    format: i.format,
    plannedPublishAt: i.plannedPublishAt,
    updatedAt: i.updatedAt,
    ownerId: i.contentOwnerId,
    ownerName: i.contentOwnerId ? (ownerById.get(i.contentOwnerId) ?? null) : null,
  }));

  // Approaching-deadline count for the attention banner: items
  // scheduled in the next 7 days that are NOT yet shipped / ready.
  const sevenDayCutoff = now.getTime() + 7 * 24 * 60 * 60 * 1000;
  const approachingCount = monthlyItems.filter(
    (i) =>
      i.plannedPublishAt.getTime() > now.getTime() &&
      i.plannedPublishAt.getTime() <= sevenDayCutoff &&
      !["ready_to_publish", "partially_published", "published", "cancelled"].includes(i.status),
  ).length;

  const monthlyTarget = settings[0]?.monthlyTarget ?? null;
  const dashboard = calculateOverviewDashboardMetrics({
    now,
    monthlyTarget,
    items: dashboardItems,
  });

  const commandCenter = buildCommandCenterSummary(
    socialAnalytics.map(({ channel, metrics }) => ({
      id: channel.id,
      platform: channel.platform as "facebook" | "instagram" | "tiktok",
      accountName: channel.accountName,
      lastSyncedAt: channel.lastSyncedAt,
      lastSyncErrorCode: channel.lastSyncErrorCode,
      latestProviderErrorCode:
        (metrics[metrics.length - 1]?.sourceMetadata as SocialSourceMetadata | null)
          ?.providerErrorCode ?? null,
      series: metrics.map((row) => {
        const metadata = row.sourceMetadata as SocialSourceMetadata | null;
        return {
          metricDate: row.metricDate,
          followerCount: row.followerCount,
          reach: row.reach,
          views: row.views,
          engagedAccounts: row.engagedAccounts,
          interactions: row.interactions,
          ...(metadata?.partial === true ? { partial: true } : {}),
          ...(metadata?.metricStatuses ? { metricStatuses: metadata.metricStatuses } : {}),
        };
      }),
    })),
    now,
    socialPostObservations.map(({ observation, channel }) => ({
      id: observation.id,
      channelId: channel.id,
      platform: channel.platform as "facebook" | "instagram" | "tiktok",
      accountName: channel.accountName,
      permalink: observation.permalink,
      publishedAt: observation.publishedAt,
      mediaType: observation.mediaType as
        "image" | "video" | "carousel" | "reel" | "story" | "unknown",
      views: observation.views,
      reach: observation.reach,
      likes: observation.likes,
      comments: observation.comments,
      saved: observation.saved,
      shares: observation.shares,
      interactions: observation.interactions,
      durationSeconds: observation.durationSeconds,
    })),
    ws.timezone,
    socialWindowDays,
  );

  // Drill-down URL builders. The planning list supports
  //   ?month=YYYY-MM  — month filter
  //   ?status=<s>     — single status filter
  //   ?format=<f>     — single format filter
  //   ?risk=at_risk   — at-risk filter (strict-overdue)
  // We compose against the same `month` the dashboard anchors to,
  // so drilling into the planning list shows the same period.
  const monthQuery = `${year}-${String(month + 1).padStart(2, "0")}`;
  const commandCenterWindowHref = (days: 30 | 90) =>
    `/app/w/${slug}?month=${monthQuery}&socialWindow=${days}`;
  const buildPlanningHref = (overrides: Record<string, string | null>) => {
    const params = new URLSearchParams();
    params.set("month", monthQuery);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    return `/app/w/${slug}/planning?${params.toString()}`;
  };

  const kpiTiles = [
    {
      label: t("workspaceOverviewDashboard.kpi.planned"),
      value: dashboard.total,
      href: buildPlanningHref({ status: null, risk: null }),
      icon: OVERVIEW_KPI_ICONS.planned,
      tone: "default" as const,
      description: t("workspaceOverviewDashboard.kpi.plannedDescription"),
    },
    {
      label: t("workspaceOverviewDashboard.kpi.onTrack"),
      value: dashboard.onTrack,
      href: buildPlanningHref({ status: null, risk: null }),
      icon: OVERVIEW_KPI_ICONS.onTrack,
      tone: "success" as const,
      description: t("workspaceOverviewDashboard.kpi.onTrackDescription"),
    },
    {
      label: t("workspaceOverviewDashboard.kpi.atRisk"),
      value: dashboard.atRisk,
      href: buildPlanningHref({ risk: "at_risk" }),
      icon: OVERVIEW_KPI_ICONS.atRisk,
      tone: "warning" as const,
      description: t("workspaceOverviewDashboard.kpi.atRiskDescription"),
    },
    {
      label: t("workspaceOverviewDashboard.kpi.needsReview"),
      value: dashboard.needsReview,
      href: buildPlanningHref({ status: "content_review" }),
      icon: OVERVIEW_KPI_ICONS.needsReview,
      tone: "info" as const,
      description: t("workspaceOverviewDashboard.kpi.needsReviewDescription"),
    },
    {
      label: t("workspaceOverviewDashboard.kpi.published"),
      value: dashboard.published,
      href: buildPlanningHref({ status: "published" }),
      icon: OVERVIEW_KPI_ICONS.published,
      tone: "muted" as const,
      description: t("workspaceOverviewDashboard.kpi.publishedDescription"),
    },
  ];

  const formatHref = (format: string) => buildPlanningHref({ status: null, format });
  const stageHref = (stage: string) => {
    // Map the 4 workflow stages to status filters the planning
    // list already understands.
    const stageToStatus: Record<string, string> = {
      planning: "draft",
      review: "content_review",
      design: "in_design",
      publish: "ready_to_publish",
    };
    return buildPlanningHref({ status: stageToStatus[stage] ?? null, risk: null });
  };

  const riskReasonHrefs: Record<string, string> = {
    past_due: buildPlanningHref({ risk: "at_risk" }),
    awaiting_review: buildPlanningHref({ status: "content_review" }),
    design_in_progress: buildPlanningHref({ status: "in_design" }),
    needs_creative: buildPlanningHref({ status: "creative_review" }),
    other: buildPlanningHref({ risk: "at_risk" }),
  };
  const riskReasons = dashboard.riskReasonCounts.map((r) => ({
    label: t(`workspaceOverviewDashboard.riskReasons.${r.reason}`),
    count: r.count,
    href: riskReasonHrefs[r.reason] ?? buildPlanningHref({ risk: "at_risk" }),
  }));

  // Month nav — Previous / Next / Today.
  const buildMonthHref = (offset: number) => {
    const target = new Date(year, month + offset, 1);
    const y = target.getFullYear();
    const m = String(target.getMonth() + 1).padStart(2, "0");
    return `/app/w/${slug}?month=${y}-${m}`;
  };
  const isCurrentMonth = year === zonedNow.getFullYear() && month === zonedNow.getMonth();
  const previousMonthLabel = formatDate(new Date(year, month - 1, 1), code, {
    month: "long",
    year: "numeric",
  });
  const nextMonthLabel = formatDate(new Date(year, month + 1, 1), code, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6" data-testid="workspace-overview">
      <PageHeader
        eyebrow={ws.name}
        actionBreakpoint="lg"
        title={
          <span className="inline-flex items-center gap-3">
            {t("workspaceOverview.title")}
            <span className="border-border bg-surface text-fg-primary inline-flex items-center gap-1 rounded-[var(--radius-control)] border px-2.5 py-1 text-sm font-semibold">
              {monthLabel}
            </span>
          </span>
        }
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>{t("workspaceOverview.description", { month: monthLabel })}</span>
            <span className="text-label text-fg-muted border-border bg-surface-subtle inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {ws.timezone}
            </span>
          </span>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={buildMonthHref(-1)}
              aria-label={t("workspaceOverview.previousMonth", { month: previousMonthLabel })}
              className="border-border bg-surface focus-visible:ring-focus-ring hover:bg-surface-subtle inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] border transition-colors focus:outline-none focus-visible:ring-2"
            >
              <DirAwareChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
            <span
              aria-label={t("workspaceOverview.selectedMonth")}
              className="text-body min-w-32 text-center font-semibold sm:min-w-36"
            >
              {monthLabel}
            </span>
            <Link
              href={buildMonthHref(1)}
              aria-label={t("workspaceOverview.nextMonth", { month: nextMonthLabel })}
              className="border-border bg-surface focus-visible:ring-focus-ring hover:bg-surface-subtle inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] border transition-colors focus:outline-none focus-visible:ring-2"
            >
              <DirAwareChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            {!isCurrentMonth ? (
              <Link
                href={`/app/w/${slug}`}
                className="text-label text-primary inline-flex min-h-9 items-center rounded-[var(--radius-control)] px-2 py-1 font-semibold underline-offset-4 hover:underline"
              >
                {t("workspaceOverview.today")}
              </Link>
            ) : null}
            <Button variant="outline" asChild>
              <Link href={`/app/w/${slug}/planning/batch`}>
                <ListChecks className="h-4 w-4" aria-hidden="true" />
                {t("workspaceOverview.batchAdd")}
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/app/w/${slug}/planning/new`}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("workspaceOverview.createContent")}
              </Link>
            </Button>
          </div>
        }
      />

      <AttentionBanner
        atRiskCount={dashboard.atRisk}
        blockedCount={dashboard.blocked}
        approachingCount={approachingCount}
        approvalsCount={approvalRows.length}
        reviewHref={buildPlanningHref({ risk: "at_risk" })}
        approvalsHref={`/app/w/${slug}/reviews`}
        t={t}
      />

      {/* Social Command Center leads the dashboard: scope/freshness → signals → action. */}
      <CommandCenterPanel
        summary={commandCenter}
        locale={code}
        timezone={ws.timezone}
        analyticsHref={`/app/w/${slug}/analytics/social`}
        researchHref={`/app/w/${slug}/research`}
        channelsHref={`/app/w/${slug}/channels`}
        planningHref={`/app/w/${slug}/planning`}
        workspaceSlug={slug}
        canRefresh={canRefreshSocial}
        savedResearchObservationIds={new Set(researchBookmarkRows.map((row) => row.observationId))}
        canSaveResearch={canSaveResearch}
        watchlist={watchlistRows.map((row) => ({
          ...row,
          platform: row.platform as "instagram" | "facebook" | "tiktok" | "youtube",
          providerStatus: row.providerStatus as "manual" | "available" | "unsupported" | "error",
        }))}
        labels={{
          eyebrow: t("workspaceOverviewDashboard.commandCenter.eyebrow"),
          title: t("workspaceOverviewDashboard.commandCenter.title"),
          description: t("workspaceOverviewDashboard.commandCenter.description", {
            days: socialWindowDays,
          }),
          analysisWindow: t("workspaceOverviewDashboard.commandCenter.analysisWindow"),
          last30Days: t("workspaceOverviewDashboard.commandCenter.last30Days"),
          last90Days: t("workspaceOverviewDashboard.commandCenter.last90Days"),
          refreshData: t("workspaceOverviewDashboard.commandCenter.refreshData"),
          refreshingData: t("workspaceOverviewDashboard.commandCenter.refreshingData"),
          refreshSuccess: t("workspaceOverviewDashboard.commandCenter.refreshSuccess"),
          refreshPartial: t("workspaceOverviewDashboard.commandCenter.refreshPartial"),
          refreshError: t("workspaceOverviewDashboard.commandCenter.refreshError"),
          viewAnalytics: t("workspaceOverviewDashboard.commandCenter.viewAnalytics"),
          viewResearch: t("workspaceOverviewDashboard.commandCenter.viewResearch"),
          freshness: t("workspaceOverviewDashboard.commandCenter.freshness"),
          noDataTitle: t("workspaceOverviewDashboard.commandCenter.noDataTitle"),
          noDataDescription: t("workspaceOverviewDashboard.commandCenter.noDataDescription"),
          connectChannels: t("workspaceOverviewDashboard.commandCenter.connectChannels"),
          setupTitle: t("workspaceOverviewDashboard.commandCenter.setupTitle"),
          setupDescription: t("workspaceOverviewDashboard.commandCenter.setupDescription"),
          setupConnectAccount: t("workspaceOverviewDashboard.commandCenter.setupConnectAccount"),
          setupCollectSignals: t("workspaceOverviewDashboard.commandCenter.setupCollectSignals"),
          setupReviewAnalytics: t("workspaceOverviewDashboard.commandCenter.setupReviewAnalytics"),
          setupOpenChannels: t("workspaceOverviewDashboard.commandCenter.setupOpenChannels"),
          setupOpenAnalytics: t("workspaceOverviewDashboard.commandCenter.setupOpenAnalytics"),
          setupComplete: t("workspaceOverviewDashboard.commandCenter.setupComplete"),
          setupNext: t("workspaceOverviewDashboard.commandCenter.setupNext"),
          partial: t("workspaceOverviewDashboard.commandCenter.partial"),
          followers: t("workspaceOverviewDashboard.commandCenter.followers"),
          followerChange: t("workspaceOverviewDashboard.commandCenter.followerChange", {
            days: socialWindowDays,
          }),
          reach: t("workspaceOverviewDashboard.commandCenter.reach"),
          views: t("workspaceOverviewDashboard.commandCenter.views"),
          interactions: t("workspaceOverviewDashboard.commandCenter.interactions"),
          engagementRate: t("workspaceOverviewDashboard.commandCenter.engagementRate"),
          trendTitle: t("workspaceOverviewDashboard.commandCenter.trendTitle"),
          trendDescription: t("workspaceOverviewDashboard.commandCenter.trendDescription", {
            days: socialWindowDays,
          }),
          trendTable: t("workspaceOverviewDashboard.commandCenter.trendTable"),
          date: t("workspaceOverviewDashboard.commandCenter.date"),
          strongestAccounts: t("workspaceOverviewDashboard.commandCenter.strongestAccounts"),
          strongestAccountsDescription: t(
            "workspaceOverviewDashboard.commandCenter.strongestAccountsDescription",
          ),
          channelPerformance: t("workspaceOverviewDashboard.commandCenter.channelPerformance"),
          channelPerformanceDescription: t(
            "workspaceOverviewDashboard.commandCenter.channelPerformanceDescription",
          ),
          noPerformanceData: t("workspaceOverviewDashboard.commandCenter.noPerformanceData"),
          topContent: t("workspaceOverviewDashboard.commandCenter.topContent"),
          topContentDescription: t(
            "workspaceOverviewDashboard.commandCenter.topContentDescription",
          ),
          contentInventory: {
            title: t("workspaceOverviewDashboard.commandCenter.contentInventory.title"),
            description: t("workspaceOverviewDashboard.commandCenter.contentInventory.description"),
            recent: t("workspaceOverviewDashboard.commandCenter.contentInventory.recent"),
            mostViewed: t("workspaceOverviewDashboard.commandCenter.contentInventory.mostViewed"),
            outlier: t("workspaceOverviewDashboard.commandCenter.contentInventory.outlier"),
            engagement: t("workspaceOverviewDashboard.commandCenter.contentInventory.engagement"),
            total: t("workspaceOverviewDashboard.commandCenter.contentInventory.total"),
            previous: t("workspaceOverviewDashboard.commandCenter.contentInventory.previous"),
            next: t("workspaceOverviewDashboard.commandCenter.contentInventory.next"),
            page: t("workspaceOverviewDashboard.commandCenter.contentInventory.page"),
            noResults: t("workspaceOverviewDashboard.commandCenter.contentInventory.noResults"),
            openSource: t("workspaceOverviewDashboard.commandCenter.openSource"),
            createBrief: t("workspaceOverviewDashboard.commandCenter.createBriefFromPost"),
            saveResearch: t("workspaceOverviewDashboard.commandCenter.saveResearch"),
            savedResearch: t("workspaceOverviewDashboard.commandCenter.savedResearch"),
            saveError: t("workspaceOverviewDashboard.commandCenter.researchSaveError"),
            views: t("workspaceOverviewDashboard.commandCenter.views"),
            interactions: t("workspaceOverviewDashboard.commandCenter.interactions"),
            likes: t("workspaceOverviewDashboard.commandCenter.likes"),
            comments: t("workspaceOverviewDashboard.commandCenter.comments"),
          },
          noContentData: t("workspaceOverviewDashboard.commandCenter.noContentData"),
          outlier: t("workspaceOverviewDashboard.commandCenter.outlier"),
          likes: t("workspaceOverviewDashboard.commandCenter.likes"),
          comments: t("workspaceOverviewDashboard.commandCenter.comments"),
          saved: t("workspaceOverviewDashboard.commandCenter.saved"),
          shares: t("workspaceOverviewDashboard.commandCenter.shares"),
          openSource: t("workspaceOverviewDashboard.commandCenter.openSource"),
          createBriefFromPost: t("workspaceOverviewDashboard.commandCenter.createBriefFromPost"),
          saveResearch: t("workspaceOverviewDashboard.commandCenter.saveResearch"),
          savedResearch: t("workspaceOverviewDashboard.commandCenter.savedResearch"),
          researchSaveError: t("workspaceOverviewDashboard.commandCenter.researchSaveError"),
          bestTime: t("workspaceOverviewDashboard.commandCenter.bestTime"),
          bestTimeDescription: t("workspaceOverviewDashboard.commandCenter.bestTimeDescription"),
          noBestTimeData: t("workspaceOverviewDashboard.commandCenter.noBestTimeData"),
          sampleSize: t("workspaceOverviewDashboard.commandCenter.sampleSize"),
          averageViews: t("workspaceOverviewDashboard.commandCenter.averageViews"),
          bestVideoLength: t("workspaceOverviewDashboard.commandCenter.bestVideoLength"),
          bestVideoLengthDescription: t(
            "workspaceOverviewDashboard.commandCenter.bestVideoLengthDescription",
          ),
          noLengthData: t("workspaceOverviewDashboard.commandCenter.noLengthData"),
          medianViews: t("workspaceOverviewDashboard.commandCenter.medianViews"),
          relativePerformance: t("workspaceOverviewDashboard.commandCenter.relativePerformance"),
          under15Seconds: t("workspaceOverviewDashboard.commandCenter.under15Seconds"),
          fifteenTo30Seconds: t("workspaceOverviewDashboard.commandCenter.fifteenTo30Seconds"),
          thirtyTo60Seconds: t("workspaceOverviewDashboard.commandCenter.thirtyTo60Seconds"),
          over60Seconds: t("workspaceOverviewDashboard.commandCenter.over60Seconds"),
          noAccountData: t("workspaceOverviewDashboard.commandCenter.noAccountData"),
          planningSignal: t("workspaceOverviewDashboard.commandCenter.planningSignal"),
          planningSignalDescription: t(
            "workspaceOverviewDashboard.commandCenter.planningSignalDescription",
          ),
          openPlanning: t("workspaceOverviewDashboard.commandCenter.openPlanning"),
          sourceNote: t("workspaceOverviewDashboard.commandCenter.sourceNote"),
          latestMetricDate: t("workspaceOverviewDashboard.commandCenter.latestMetricDate"),
          coverage: t("workspaceOverviewDashboard.commandCenter.coverage"),
          notEnoughData: t("workspaceOverviewDashboard.commandCenter.notEnoughData"),
          dataHealth: t("workspaceOverviewDashboard.commandCenter.dataHealth"),
          dataHealthDescription: t(
            "workspaceOverviewDashboard.commandCenter.dataHealthDescription",
          ),
          healthy: t("workspaceOverviewDashboard.commandCenter.healthy"),
          degraded: t("workspaceOverviewDashboard.commandCenter.degraded"),
          stalled: t("workspaceOverviewDashboard.commandCenter.stalled"),
          noSync: t("workspaceOverviewDashboard.commandCenter.noSync"),
          reviewData: t("workspaceOverviewDashboard.commandCenter.reviewData"),
          watchlistTitle: t("workspaceOverviewDashboard.commandCenter.watchlistTitle"),
          watchlistDescription: t("workspaceOverviewDashboard.commandCenter.watchlistDescription"),
          watchlistSourceOnly: t("workspaceOverviewDashboard.commandCenter.watchlistSourceOnly"),
          watchlistProviderAvailable: t(
            "workspaceOverviewDashboard.commandCenter.watchlistProviderAvailable",
          ),
          watchlistProviderUnsupported: t(
            "workspaceOverviewDashboard.commandCenter.watchlistProviderUnsupported",
          ),
          watchlistProviderError: t(
            "workspaceOverviewDashboard.commandCenter.watchlistProviderError",
          ),
          manageAccounts: t("workspaceOverviewDashboard.commandCenter.manageAccounts"),
          viewAllChannels: t("workspaceOverviewDashboard.commandCenter.viewAllChannels"),
          viewAll: t("workspaceOverviewDashboard.commandCenter.viewAll"),
          lastSynced: t("workspaceOverviewDashboard.commandCenter.lastSynced"),
          comparedToPrevious: t("workspaceOverviewDashboard.commandCenter.comparedToPrevious"),
          bestSlot: t("workspaceOverviewDashboard.commandCenter.bestSlot"),
          bestSlotDescription: t("workspaceOverviewDashboard.commandCenter.bestSlotDescription"),
          basedOnRecentContent: t("workspaceOverviewDashboard.commandCenter.basedOnRecentContent"),
          heatMapLess: t("workspaceOverviewDashboard.commandCenter.heatMapLess"),
          heatMapMore: t("workspaceOverviewDashboard.commandCenter.heatMapMore"),
          heatMapLegend: t("workspaceOverviewDashboard.commandCenter.heatMapLegend"),
          noFollowerData: t("workspaceOverviewDashboard.commandCenter.noFollowerData"),
          observedContent: t("workspaceOverviewDashboard.commandCenter.observedContent"),
          observedContentDescription: t(
            "workspaceOverviewDashboard.commandCenter.observedContentDescription",
          ),
          channel: t("workspaceOverviewDashboard.commandCenter.channel"),
        }}
        windowDays={socialWindowDays}
        window30Href={commandCenterWindowHref(30)}
        window90Href={commandCenterWindowHref(90)}
      />

      {/* Planning & workflow — matches the reference section header that
          groups plan coverage, delivery health and the workflow pipeline. */}
      <section aria-labelledby="planning-and-workflow-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="planning-and-workflow-title"
              className="text-title-card text-fg-primary font-semibold"
            >
              {t("workspaceOverviewDashboard.commandCenter.planningAndWorkflow")}
            </h2>
            <p className="text-label text-fg-secondary mt-1">
              {t("workspaceOverviewDashboard.commandCenter.planningAndWorkflowDescription")}
            </p>
          </div>
          <Link
            href={`/app/w/${slug}/planning`}
            className="text-label text-primary focus-visible:ring-focus-ring inline-flex items-center gap-1 rounded font-semibold focus:outline-none focus-visible:ring-2"
          >
            {t("workspaceOverviewDashboard.commandCenter.goToPlanning")}
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        {/* Planning execution summary follows the decision layer. */}
        <OverviewKpiStrip tiles={kpiTiles} t={t} />

        {/* Plan Coverage + Delivery Health — 7-col / 5-col on desktop */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <PlanCoverageCard
              total={dashboard.total}
              monthlyTarget={dashboard.monthlyTarget}
              coveragePercent={dashboard.coveragePercent}
              formatBreakdown={dashboard.formatBreakdown.map((entry) => ({
                ...entry,
                label: t(`workspaceOverviewDashboard.formatLabels.${entry.format}`),
              }))}
              buildFormatHref={formatHref}
              settingsHref={`/app/w/${slug}/settings`}
              t={t}
            />
          </div>
          <div className="lg:col-span-5">
            <DeliveryHealthCard
              total={dashboard.total}
              onTrackCount={dashboard.onTrack}
              onTrackPercent={dashboard.onTrackPercent}
              atRiskCount={dashboard.atRisk}
              atRiskPercent={dashboard.atRiskPercent}
              blockedCount={dashboard.blocked}
              blockedPercent={dashboard.blockedPercent}
              riskReasons={riskReasons}
              atRiskHref={buildPlanningHref({ risk: "at_risk" })}
              onTrackHref={buildPlanningHref({ status: null, risk: null })}
              blockedHref={buildPlanningHref({ status: "blocked" })}
              viewAllHref={buildPlanningHref({ risk: "at_risk" })}
              t={t}
            />
          </div>
        </div>

        {/* Workflow pipeline (master prompt §10-13) */}
        <WorkflowPipeline
          stages={dashboard.workflowStages.map((s) => ({
            stage: s.stage,
            label: t(`workspaceOverviewDashboard.workflowStages.${s.stage}`),
            count: s.count,
          }))}
          buildHref={stageHref}
          t={t}
        />
      </section>

      {/* Needs attention + Recently updated (master prompt §14-16) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <NeedsAttentionList
            items={dashboard.needsAttention}
            workspaceSlug={slug}
            now={now}
            viewAllHref={buildPlanningHref({ risk: "at_risk" })}
            t={t}
          />
        </div>
        <div className="lg:col-span-4">
          <RecentlyUpdatedList
            items={dashboard.recentlyUpdated}
            workspaceSlug={slug}
            viewAllHref={buildPlanningHref({ status: null, risk: null })}
            createHref={`/app/w/${slug}/planning/new`}
            t={t}
            locale={code}
          />
        </div>
      </div>
    </div>
  );
}
