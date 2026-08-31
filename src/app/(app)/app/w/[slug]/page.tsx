import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq, gte, isNull, lt } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { contentItems, users, workspaceMemberships, workspaceSettings } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Clock, ListChecks, Plus } from "lucide-react";
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
import { calculateOverviewDashboardMetrics } from "@/lib/dashboard/kpis";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";

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
  const { slug } = await params;
  return { title: `${slug} — Overview` };
}

export default async function WorkspaceOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { slug } = await params;
  const filters = await searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const ws = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!ws) notFound();

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
  const monthLabel = activeMonth.toLocaleString("en-US", { month: "long", year: "numeric" });
  const now = new Date();

  // Single SQL: pull the dashboard items + the workspace owner's
  // display name (for the needs-attention list) + workspace
  // settings (for the monthly target). The list-safe rollup
  // operates on whatever rows the SQL returns — no N+1 readiness
  // call per item.
  const [monthlyItems, settings, ownerRows, approvalRows] = await Promise.all([
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
    // Approvals count for the attention banner. A real approval
    // row is one where the actor is the current user and the row
    // is still pending. We surface the count; the banner links
    // to the dedicated /reviews surface.
    db
      .select({ id: contentItems.id })
      .from(contentItems)
      .where(
        and(
          eq(contentItems.workspaceId, ws.id),
          isNull(contentItems.archivedAt),
          eq(contentItems.contentReviewerId, session.user.id),
        ),
      )
      .limit(50),
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

  // Drill-down URL builders. The planning list supports
  //   ?month=YYYY-MM  — month filter
  //   ?status=<s>     — single status filter
  //   ?format=<f>     — single format filter
  //   ?risk=at_risk   — at-risk filter (strict-overdue)
  // We compose against the same `month` the dashboard anchors to,
  // so drilling into the planning list shows the same period.
  const monthQuery = `${year}-${String(month + 1).padStart(2, "0")}`;
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
      label: "Planned",
      value: dashboard.total,
      href: buildPlanningHref({ status: null, risk: null }),
      icon: OVERVIEW_KPI_ICONS.planned,
      tone: "default" as const,
      description: "All non-cancelled items in the selected month.",
    },
    {
      label: "On track",
      value: dashboard.onTrack,
      href: buildPlanningHref({ status: null, risk: null }),
      icon: OVERVIEW_KPI_ICONS.onTrack,
      tone: "success" as const,
      description: "Items that are not overdue and not blocked.",
    },
    {
      label: "At risk",
      value: dashboard.atRisk,
      href: buildPlanningHref({ risk: "at_risk" }),
      icon: OVERVIEW_KPI_ICONS.atRisk,
      tone: "warning" as const,
      description: "Items past their planned publish date that haven't shipped.",
    },
    {
      label: "Needs review",
      value: dashboard.needsReview,
      href: buildPlanningHref({ status: "content_review" }),
      icon: OVERVIEW_KPI_ICONS.needsReview,
      tone: "info" as const,
      description: "Items waiting on content, creative, or changes.",
    },
    {
      label: "Published",
      value: dashboard.published,
      href: buildPlanningHref({ status: "published" }),
      icon: OVERVIEW_KPI_ICONS.published,
      tone: "muted" as const,
      description: "Items fully published this month.",
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
    label: r.label,
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
  const previousMonthLabel = new Date(year, month - 1, 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });
  const nextMonthLabel = new Date(year, month + 1, 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6" data-testid="workspace-overview">
      <AttentionBanner
        atRiskCount={dashboard.atRisk}
        blockedCount={dashboard.blocked}
        approachingCount={approachingCount}
        approvalsCount={approvalRows.length}
        reviewHref={buildPlanningHref({ risk: "at_risk" })}
        approvalsHref={`/app/w/${slug}/reviews`}
      />
      <PageHeader
        eyebrow={ws.name}
        title={
          <span className="inline-flex items-center gap-3">
            Overview
            <span className="border-border bg-surface text-fg-primary inline-flex items-center gap-1 rounded-[var(--radius-control)] border px-2.5 py-1 text-sm font-semibold">
              {monthLabel}
            </span>
          </span>
        }
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>
              Monitor planning, workflow health and publishing readiness for {monthLabel}.
            </span>
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
              aria-label={`Previous month, ${previousMonthLabel}`}
              className="border-border bg-surface focus-visible:ring-focus-ring hover:bg-surface-subtle inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] border transition-colors focus:outline-none focus-visible:ring-2"
            >
              <DirAwareChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
            <span
              aria-label="Selected month"
              className="text-body min-w-32 text-center font-semibold sm:min-w-36"
            >
              {monthLabel}
            </span>
            <Link
              href={buildMonthHref(1)}
              aria-label={`Next month, ${nextMonthLabel}`}
              className="border-border bg-surface focus-visible:ring-focus-ring hover:bg-surface-subtle inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] border transition-colors focus:outline-none focus-visible:ring-2"
            >
              <DirAwareChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            {!isCurrentMonth ? (
              <Link
                href={`/app/w/${slug}`}
                className="text-label text-primary inline-flex min-h-9 items-center rounded-[var(--radius-control)] px-2 py-1 font-semibold underline-offset-4 hover:underline"
              >
                Today
              </Link>
            ) : null}
            <Button variant="outline" asChild>
              <Link href={`/app/w/${slug}/planning/batch`}>
                <ListChecks className="h-4 w-4" aria-hidden="true" />
                Batch add ideas
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/app/w/${slug}/planning/new`}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create content
              </Link>
            </Button>
          </div>
        }
      />

      {/* Executive summary strip (master prompt §5) */}
      <OverviewKpiStrip tiles={kpiTiles} />

      {/* Plan Coverage + Delivery Health — 7-col / 5-col on desktop */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <PlanCoverageCard
            total={dashboard.total}
            monthlyTarget={dashboard.monthlyTarget}
            coveragePercent={dashboard.coveragePercent}
            formatBreakdown={dashboard.formatBreakdown}
            buildFormatHref={formatHref}
            settingsHref={`/app/w/${slug}/settings`}
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
          />
        </div>
      </div>

      {/* Workflow pipeline (master prompt §10-13) */}
      <WorkflowPipeline
        stages={dashboard.workflowStages.map((s) => ({
          stage: s.stage,
          label: s.label,
          count: s.count,
        }))}
        buildHref={stageHref}
      />

      {/* Needs attention + Recently updated (master prompt §14-16) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <NeedsAttentionList
            items={dashboard.needsAttention}
            workspaceSlug={slug}
            now={now}
            viewAllHref={buildPlanningHref({ risk: "at_risk" })}
          />
        </div>
        <div className="lg:col-span-4">
          <RecentlyUpdatedList
            items={dashboard.recentlyUpdated}
            workspaceSlug={slug}
            viewAllHref={buildPlanningHref({ status: null, risk: null })}
            createHref={`/app/w/${slug}/planning/new`}
          />
        </div>
      </div>
    </div>
  );
}
