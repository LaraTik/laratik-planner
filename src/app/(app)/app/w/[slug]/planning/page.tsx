import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import {
  decodeContentCursor,
  encodeContentCursor,
  listWorkspaceContent,
} from "@/lib/content/service";
import { ALL_FORMATS, ALL_STATUSES, humanFormat } from "@/lib/content/status";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { Clock, Files, Plus, FileText } from "lucide-react";
import { StatusBadge } from "@/components/content/status-badge";
import { PageHeader } from "@/components/workspace/page-header";
import { ListCard, ListItem } from "@/components/workspace/list-item";
import { MonthNav } from "@/components/workspace/month-nav";
import { PlanningFilters } from "@/components/workspace/planning-filters";
import { PlanningKpiBar } from "@/components/workspace/planning-kpi-bar";
import { describeActiveFilter } from "./filter-describe";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import {
  type KpiContentFormat,
  type KpiContentStatus,
  calculateWorkspaceKpis,
} from "@/lib/dashboard/kpis";
import { db } from "@/lib/db";
import { users, workspaceMemberships } from "@/lib/db/schema";

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
  searchParams: Promise<{
    month?: string;
    status?: string;
    risk?: string;
    density?: string;
    /**
     * FEAT-09 (GAP-FULL-REVIEW-2026-08-25) — new search / owner /
     * format filters and the "load more" cursor. The cursor is the
     * base64url-encoded `(plannedPublishAt, id)` of the last item on
     * the previous page.
     */
    search?: string;
    owner?: string;
    format?: string;
    cursor?: string;
  }>;
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
  const selectedFormat =
    filters.format && (ALL_FORMATS as readonly string[]).includes(filters.format as never)
      ? filters.format
      : undefined;
  const searchTerm = filters.search?.trim() || undefined;
  const ownerFilter =
    filters.owner && /^[0-9a-f-]{36}$/i.test(filters.owner) ? filters.owner : undefined;
  const cursor = decodeContentCursor(filters.cursor);
  const density = filters.density === "compact" ? "compact" : "comfortable";
  // Per-page cap. 20 keeps the first paint fast; the load-more button
  // is the path to deeper history. The cap also gives the cursor a
  // well-defined "next" when we have at least one more row beyond it.
  const pageSize = 20;
  let items = await listWorkspaceContent({ id: session.user.id }, ws.id, {
    monthStart,
    monthEnd,
    ...(selectedStatus ? { status: selectedStatus } : {}),
    ...(selectedFormat ? { format: selectedFormat } : {}),
    ...(ownerFilter ? { ownerId: ownerFilter } : {}),
    ...(searchTerm ? { search: searchTerm } : {}),
    ...(cursor ? { cursor } : {}),
    limit: pageSize + 1,
  });
  if (filters.risk === "at_risk")
    items = items.filter(
      (item) =>
        item.plannedPublishAt < new Date() &&
        !["ready_to_publish", "partially_published", "published", "cancelled"].includes(
          item.status,
        ),
    );
  const hasNextPage = items.length > pageSize;
  const visibleItems = hasNextPage ? items.slice(0, pageSize) : items;
  const nextCursor =
    hasNextPage && visibleItems.length > 0
      ? {
          plannedPublishAt: visibleItems[visibleItems.length - 1]!.plannedPublishAt,
          id: visibleItems[visibleItems.length - 1]!.id,
        }
      : null;

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

  // Owner dropdown source — every active workspace member, in display
  // order. Joining on users gives us a name for the option label.
  const memberRows = await db
    .select({ id: users.id, name: users.name, displayName: users.displayName })
    .from(workspaceMemberships)
    .innerJoin(users, eq(users.id, workspaceMemberships.userId))
    .where(eq(workspaceMemberships.workspaceId, ws.id))
    .orderBy(asc(users.displayName), asc(users.name));

  const monthParam = (offset: number) => {
    const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  };
  const buildMonthHref = (offset: number) => `?month=${monthParam(offset)}`;
  const hasFilter = Boolean(
    selectedStatus || selectedFormat || ownerFilter || searchTerm || filters.risk,
  );

  // Build the load-more URL by re-serialising the active filters plus
  // the next cursor. We rebuild from a known set of keys so we never
  // leak internal params (`risk`, `density`) into the link.
  const loadMoreHref = (() => {
    if (!nextCursor) return null;
    const params = new URLSearchParams();
    params.set("month", monthParam(0));
    if (selectedStatus) params.set("status", selectedStatus);
    if (selectedFormat) params.set("format", selectedFormat);
    if (ownerFilter) params.set("owner", ownerFilter);
    if (searchTerm) params.set("search", searchTerm);
    if (filters.density === "compact") params.set("density", "compact");
    params.set("cursor", encodeContentCursor(nextCursor));
    return `?${params.toString()}`;
  })();

  return (
    <div className="space-y-6" data-testid="workspace-planning">
      <PageHeader
        eyebrow={ws.name}
        title="Planning"
        description={
          <>
            {now.toLocaleString("default", { month: "long", year: "numeric" })} ·{" "}
            {visibleItems.length} item{visibleItems.length === 1 ? "" : "s"}
            <span className="text-label text-fg-muted border-border bg-surface-subtle ml-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {ws.timezone}
            </span>
          </>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
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
          selectedFormat={selectedFormat}
          selectedOwnerId={ownerFilter}
          searchValue={searchTerm}
          density={density}
          hasFilter={hasFilter}
          members={memberRows.map((m) => ({
            id: m.id,
            label: m.displayName ?? m.name ?? m.id.slice(0, 8),
          }))}
        />
      </div>

      {visibleItems.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" aria-hidden="true" />}
          title={hasFilter ? "No items match your filters" : "Nothing planned for this month"}
          description={
            hasFilter
              ? `No items match ${describeActiveFilter(
                  Object.fromEntries(
                    Object.entries({
                      status: selectedStatus,
                      format: selectedFormat,
                      ownerId: ownerFilter,
                      search: searchTerm,
                      risk: filters.risk,
                    }).filter(([, v]) => v != null),
                  ) as Parameters<typeof describeActiveFilter>[0],
                )}. Try clearing the filter to see everything planned for this month.`
              : "Use Quick Create to add a draft — it'll show up here ready to schedule."
          }
          action={
            hasFilter ? (
              <Button variant="outline" asChild>
                <Link
                  href={`/app/w/${slug}/planning?month=${monthParam(0)}`}
                  data-testid="planning-empty-clear-filters"
                >
                  Clear filters
                </Link>
              </Button>
            ) : canCreate ? (
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
        <>
          <ListCard>
            {visibleItems.map((it) => (
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
          {loadMoreHref ? (
            <div className="flex justify-center">
              <Button variant="outline" asChild>
                <Link
                  href={loadMoreHref}
                  data-testid="planning-load-more"
                  aria-label="Load more content items"
                >
                  Load more
                </Link>
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
