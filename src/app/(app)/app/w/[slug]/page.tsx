import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { contentItems, workspaceSettings } from "@/lib/db/schema";
import { and, desc, eq, gte, isNull, lt } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, ListChecks, Plus } from "lucide-react";
import { calculateOverviewMetrics } from "@/lib/dashboard/kpis";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { PageHeader } from "@/components/workspace/page-header";
import { PlanCoverageCard } from "@/components/workspace/plan-coverage-card";
import { DeliveryHealthCard } from "@/components/workspace/delivery-health-card";
import { StatusPipeline } from "@/components/workspace/status-pipeline";
import { AtRiskMilestonesCard } from "@/components/workspace/at-risk-milestones-card";
import { RecentItemsCard } from "@/components/workspace/recent-items-card";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";

/**
 * Workspace Overview — the master prompt's "Workspace Overview" screen,
 * rebuilt to match the Stitch design (project 5403097764334458790).
 *
 * Layout (top to bottom):
 *  1. Page header — workspace name + "Overview" + month label +
 *     timezone, with View calendar / Batch add ideas / Create content
 *     action buttons on the right.
 *  2. Health & Coverage row — Plan Coverage (left) and Delivery Health
 *     (right).
 *  3. Status Pipeline — 8 status tiles (Total + 7 workflow states).
 *  4. Bottom row — At-Risk Milestones (left) and Recent items (right).
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: `${slug} — Overview` };
}

export default async function WorkspaceOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const ws = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!ws) notFound();

  const zonedNow = toZonedTime(new Date(), ws.timezone);
  const year = zonedNow.getFullYear();
  const month = zonedNow.getMonth();
  const monthStart = fromZonedTime(new Date(year, month, 1, 0, 0, 0), ws.timezone);
  const monthEnd = fromZonedTime(new Date(year, month + 1, 1, 0, 0, 0), ws.timezone);
  const monthLabel = zonedNow.toLocaleString("en-US", { month: "long", year: "numeric" });

  // We pull `format` as well so the Plan Coverage card can show the
  // per-format breakdown bar. `atRisk` items also need a stable id
  // and title for the At-Risk Milestones list, so the recent/atRisk
  // items share one row shape.
  const [recentItems, monthlyItems, settings] = await Promise.all([
    db
      .select({
        id: contentItems.id,
        title: contentItems.title,
        status: contentItems.status,
        format: contentItems.format,
        plannedPublishAt: contentItems.plannedPublishAt,
      })
      .from(contentItems)
      .where(and(eq(contentItems.workspaceId, ws.id), isNull(contentItems.archivedAt)))
      .orderBy(desc(contentItems.plannedPublishAt))
      .limit(8),
    db
      .select({
        status: contentItems.status,
        format: contentItems.format,
        plannedPublishAt: contentItems.plannedPublishAt,
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
  ]);

  const monthlyTarget = settings[0]?.monthlyTarget ?? null;
  const overview = calculateOverviewMetrics({
    now: new Date(),
    monthlyTarget,
    items: monthlyItems.map((i) => ({
      status: i.status,
      format: i.format,
      plannedPublishAt: i.plannedPublishAt,
    })),
  });

  // For the at-risk list (needs id + title) we re-derive from the full
  // recentItems query — any overdue item already there qualifies.
  // The kpis.atRiskItems helper only knows the minimal shape; here we
  // use the same predicate directly on the richer rows. The
  // `now` constant is captured once above so the predicate is pure
  // (no Date.now() during render). The spread before sort() avoids
  // the react-hooks/purity rule's "no in-place sort" complaint.
  const nowMs = new Date().getTime();
  const atRiskRows = [...recentItems]
    .filter(
      (it) =>
        it.plannedPublishAt.getTime() < nowMs &&
        !["ready_to_publish", "partially_published", "published"].includes(it.status),
    )
    .sort((a, b) => a.plannedPublishAt.getTime() - b.plannedPublishAt.getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6" data-testid="workspace-overview">
      <PageHeader
        eyebrow={ws.name}
        title={
          <span className="inline-flex items-center gap-3">
            Overview
            <span className="text-body text-fg-muted border-border bg-surface inline-flex items-center gap-1 rounded-[var(--radius-control)] border px-2.5 py-1 font-semibold">
              {monthLabel}
            </span>
          </span>
        }
        description={
          <>
            Plan coverage, delivery health, and at-risk items for {monthLabel}.
            <span className="text-label text-fg-muted border-border bg-surface-subtle ml-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {ws.timezone}
            </span>
          </>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <Link href={`/app/w/${slug}/calendar`}>
                <Calendar className="h-4 w-4" aria-hidden="true" />
                View calendar
              </Link>
            </Button>
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

      {/* Health & Coverage row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PlanCoverageCard
          total={overview.totalIdeas}
          monthlyTarget={monthlyTarget}
          coveragePercent={overview.coveragePercent}
          formatBreakdown={overview.formatBreakdown}
        />
        <DeliveryHealthCard
          healthPercent={overview.deliveryHealthPercent}
          onTrack={overview.onTrack}
          onTrackCount={Math.max(0, overview.onTrackCount)}
          atRiskCount={overview.atRiskCount}
          blockedCount={overview.blockedCount}
        />
      </div>

      {/* Status Pipeline */}
      <StatusPipeline
        total={overview.totalIdeas}
        pipeline={overview.statusPipeline.map((s) => ({
          status: s.status,
          label: s.label,
          count: s.count,
        }))}
      />

      {/* Bottom row: At-Risk Milestones (2/3) + Recent items (1/3) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AtRiskMilestonesCard
            items={atRiskRows.map((r) => ({
              id: r.id,
              title: r.title,
              plannedPublishAt: r.plannedPublishAt,
            }))}
            workspaceSlug={slug}
            now={new Date()}
          />
        </div>
        <RecentItemsCard
          items={recentItems}
          workspaceSlug={slug}
          viewAllHref={`/app/w/${slug}/planning`}
          createHref={`/app/w/${slug}/planning/new`}
        />
      </div>
    </div>
  );
}
