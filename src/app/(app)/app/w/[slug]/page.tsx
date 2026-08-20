import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { contentItems, workspaceSettings } from "@/lib/db/schema";
import { and, desc, eq, gte, isNull, lt } from "drizzle-orm";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card } from "@/components/ui/card";
import { Calendar, CalendarPlus, FileText, ListChecks, Plus } from "lucide-react";
import { calculateOverviewMetrics } from "@/lib/dashboard/kpis";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { StatusBadge } from "@/components/content/status-badge";
import { PageHeader } from "@/components/workspace/page-header";
import { PlanCoverageCard } from "@/components/workspace/plan-coverage-card";
import { DeliveryHealthCard } from "@/components/workspace/delivery-health-card";
import { StatusPipeline } from "@/components/workspace/status-pipeline";
import { AtRiskMilestonesCard } from "@/components/workspace/at-risk-milestones-card";
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
    <div className="space-y-6">
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
        description={ws.timezone}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/app/w/${slug}/calendar`}
              className="border-border bg-surface text-fg-primary hover:bg-surface-subtle text-button inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border px-4 py-2 font-semibold transition-colors"
            >
              <Calendar className="h-4 w-4" aria-hidden="true" />
              View calendar
            </Link>
            <Link
              href={`/app/w/${slug}/planning/batch`}
              className="border-border bg-surface text-fg-primary hover:bg-surface-subtle text-button inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border px-4 py-2 font-semibold transition-colors"
            >
              <ListChecks className="h-4 w-4" aria-hidden="true" />
              Batch add ideas
            </Link>
            <Link
              href={`/app/w/${slug}/planning/new`}
              className="bg-primary text-on-primary hover:bg-primary-hover text-button inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-4 py-2 font-semibold transition-colors"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create content
            </Link>
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
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-title-card text-fg-primary font-semibold">Recent items</h2>
            <Link
              href={`/app/w/${slug}/planning`}
              className="text-label text-primary rounded-[var(--radius-control)] px-2 py-1 underline-offset-4 hover:underline"
            >
              View all →
            </Link>
          </div>
          {recentItems.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-8 w-8" aria-hidden="true" />}
              title="No content yet"
              description="Once someone in this workspace creates a draft, it'll show up here."
              action={
                <Link
                  href={`/app/w/${slug}/planning/new`}
                  className="bg-primary text-on-primary text-button inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-3 py-1.5 font-semibold"
                >
                  <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                  New content
                </Link>
              }
            />
          ) : (
            <ul className="divide-border divide-y">
              {recentItems.map((it) => (
                <li key={it.id} className="text-body flex items-center gap-3 py-2">
                  <FileText className="text-fg-muted h-4 w-4" aria-hidden="true" />
                  <Link
                    href={`/app/w/${slug}/planning/${it.id}`}
                    className="text-fg-primary flex-1 truncate font-semibold"
                  >
                    {it.title}
                  </Link>
                  <span className="text-label text-fg-muted inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" aria-hidden="true" />
                    {it.plannedPublishAt.toLocaleDateString()}
                  </span>
                  <StatusBadge status={it.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
