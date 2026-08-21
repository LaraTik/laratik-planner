import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { listWorkspaceContent } from "@/lib/content/service";
import { ALL_STATUSES, humanFormat } from "@/lib/content/status";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { Clock, Files, Plus, FileText } from "lucide-react";
import { StatusBadge } from "@/components/content/status-badge";
import { PageHeader } from "@/components/workspace/page-header";
import { ListCard, ListItem } from "@/components/workspace/list-item";
import { MonthNav } from "@/components/workspace/month-nav";
import { PlanningFilters } from "@/components/workspace/planning-filters";
import { PlanningKpiBar } from "@/components/workspace/planning-kpi-bar";
import { PlanningViewToggle } from "@/components/workspace/planning-view-toggle";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import {
  type KpiContentFormat,
  type KpiContentStatus,
  calculateWorkspaceKpis,
} from "@/lib/dashboard/kpis";

/**
 * Planning list (Goal 6 master prompt §3 Monthly Planning List).
 *
 * Shows the current month's content for the workspace, ordered by
 * planned publish date. Defaults to "all" status; status filter is a
 * later enhancement. M2.2 brings the page closer to the Stitch design
 * (project 5403097764334458790) by adding the 4-tile KPI bar (Total /
 * At Risk / Needs Review / Ready) and the List/Board/Calendar view
 * toggle. The list itself stays in list-card form (a future pass can
 * switch to a denser table layout).
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return { title: `Planning · ${(await params).slug}` };
}

export default async function PlanningPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ month?: string; status?: string; risk?: string; density?: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const ws = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!ws) notFound();
  const canCreate = await hasWorkspaceRole({ id: session.user.id }, ws.id, [
    "workspace_manager",
    "content_planner",
  ]);

  const filters = await searchParams;
  const match = filters.month?.match(/^(\d{4})-(\d{2})$/);
  const now = match ? new Date(Number(match[1]), Number(match[2]) - 1, 1) : new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const selectedStatus =
    filters.status && (ALL_STATUSES as readonly string[]).includes(filters.status)
      ? filters.status
      : undefined;
  const density = filters.density === "compact" ? "compact" : "comfortable";
  let items = await listWorkspaceContent({ id: session.user.id }, ws.id, {
    monthStart,
    monthEnd,
    ...(selectedStatus ? { status: selectedStatus } : {}),
  });
  if (filters.risk === "at_risk")
    items = items.filter(
      (item) =>
        item.plannedPublishAt < new Date() &&
        !["ready_to_publish", "partially_published", "published", "cancelled"].includes(
          item.status,
        ),
    );

  // KPI tile counts — derived from the unfiltered list so the tiles
  // always reflect the full month, not whatever filter the user has
  // applied. The current filter still drives the rendered list.
  // Math is shared with the workspace overview (calculateWorkspaceKpis)
  // so the two pages can never disagree.
  const allMonthItems = await listWorkspaceContent({ id: session.user.id }, ws.id, {
    monthStart,
    monthEnd,
  });
  const kpis = calculateWorkspaceKpis({
    now: new Date(),
    monthlyTarget: null,
    items: allMonthItems.map((i) => ({
      status: i.status as KpiContentStatus,
      plannedPublishAt: i.plannedPublishAt,
    })) as { status: KpiContentStatus; plannedPublishAt: Date; format?: KpiContentFormat }[],
  });

  const monthParam = (offset: number) => {
    const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  };
  const buildMonthHref = (offset: number) => `?month=${monthParam(offset)}`;
  const hasFilter = Boolean(selectedStatus || filters.risk);

  return (
    <div className="space-y-6" data-testid="workspace-planning">
      <PageHeader
        eyebrow={ws.name}
        title="Planning"
        description={
          <>
            {now.toLocaleString("default", { month: "long", year: "numeric" })} · {items.length}{" "}
            item{items.length === 1 ? "" : "s"}
            <span className="text-label text-fg-muted border-border bg-surface-subtle ml-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {ws.timezone}
            </span>
          </>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <PlanningViewToggle workspaceSlug={slug} />
            {canCreate ? (
              <>
                <Button variant="outline" asChild>
                  <Link href={`/app/w/${slug}/planning/batch`}>
                    <Files className="h-4 w-4" />
                    Batch add
                  </Link>
                </Button>
                <Button asChild>
                  <Link href={`/app/w/${slug}/planning/new`}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Quick Create
                  </Link>
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      <PlanningKpiBar
        total={kpis.totalIdeas}
        atRisk={kpis.atRisk}
        needsReview={kpis.needsReview}
        ready={kpis.ready}
        baseHref={`/app/w/${slug}/planning`}
        currentQuery={
          new URLSearchParams(
            Object.entries({ month: monthParam(0) }).filter(([, v]) => v != null) as [
              string,
              string,
            ][],
          )
        }
      />

      <div className="border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-card)] border p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <MonthNav month={now} buildHref={buildMonthHref} />
        <PlanningFilters
          slug={slug}
          monthParam={monthParam(0)}
          selectedStatus={selectedStatus}
          density={density}
          hasFilter={hasFilter}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" aria-hidden="true" />}
          title="Nothing planned for this month"
          description="Use Quick Create to add a draft — it'll show up here ready to schedule."
          action={
            canCreate ? (
              <Button asChild>
                <Link href={`/app/w/${slug}/planning/new`}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Quick Create
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ListCard>
          {items.map((it) => (
            <ListItem
              key={it.id}
              href={`/app/w/${slug}/planning/${it.id}`}
              leading={<FileText className="text-fg-muted h-4 w-4" aria-hidden="true" />}
              title={it.title}
              meta={`${humanFormat(it.format)} · ${it.plannedPublishAt.toLocaleDateString()}`}
              trailing={<StatusBadge status={it.status} />}
              density={density}
            />
          ))}
        </ListCard>
      )}
    </div>
  );
}
