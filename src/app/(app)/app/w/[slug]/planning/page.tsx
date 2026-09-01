import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { listWorkspaceContent } from "@/lib/content/service";
import { listWorkspaceContentEnriched, resolveActorRoles } from "@/lib/content/enriched-list";
import { ALL_FORMATS, ALL_STATUSES } from "@/lib/content/status";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { Clock, Files, Plus, FileText, Download, AlertTriangle, LayoutGrid } from "lucide-react";
import { PageHeader } from "@/components/workspace/page-header";
import { PlanningListActions } from "@/components/workspace/planning-list-actions";
import { PlanningListGrouped } from "@/components/workspace/planning-list-grouped";
import { PlanningFiltersBar } from "@/components/workspace/planning-filters-bar";
import { MonthNav } from "@/components/workspace/month-nav";
import { PlanningKpiBar } from "@/components/workspace/planning-kpi-bar";
import { Pagination } from "@/components/workspace/pagination";
import { describeActiveFilter } from "./filter-describe";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import {
  type KpiContentFormat,
  type KpiContentStatus,
  calculateWorkspaceKpis,
} from "@/lib/dashboard/kpis";
import { aggregateHealth } from "@/lib/dashboard/health";
import { db } from "@/lib/db";
import { users, workspaceMemberships } from "@/lib/db/schema";
import { tForActive } from "@/lib/i18n/t-for-active";

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
 *
 * Pagination (Just Halal workspace remediation, 2026-08-29):
 *  - Page-based navigation (`?page=1`, `?page=2`, …) is the
 *    canonical path. The previous "load more" cursor is still
 *    supported in the service layer for callers that prefer it
 *    (e.g. the unassigned design queue), but the planning list
 *    renders the standard first / prev / pages / next / last
 *    control so users can jump directly to any page.
 *  - A separate `countWorkspaceContent` query gives the total
 *    matched rows so the "Showing X–Y of Z" line is correct.
 *  - The 1-indexed page number is the only pagination param on
 *    the URL; the other filter / sort / density params are
 *    preserved on every page link.
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
    search?: string;
    owner?: string;
    format?: string;
    /**
     * 1-indexed page number. Defaults to 1. Invalid values
     * (non-numeric, <1) are clamped to 1.
     */
    page?: string;
  }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const { t, dir } = await tForActive();
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
  const density = filters.density === "compact" ? "compact" : "comfortable";
  // Per-page cap. 20 keeps the first paint fast; the pagination
  // control below handles deeper history.
  const pageSize = 20;
  // Clamp the page number to a 1-indexed positive integer. Anything
  // missing / malformed / <1 collapses to 1.
  const parsedPage = Number.parseInt(filters.page ?? "1", 10);
  const requestedPage = Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

  // The two queries run in parallel — the data page and the total
  // count. They're independent and both index the workspace_id +
  // planned_publish_at columns.
  const filterOpts = {
    monthStart,
    monthEnd,
    ...(selectedStatus ? { status: selectedStatus } : {}),
    ...(selectedFormat ? { format: selectedFormat } : {}),
    ...(ownerFilter ? { ownerId: ownerFilter } : {}),
    ...(searchTerm ? { search: searchTerm } : {}),
  } as const;

  // Two parallel queries: the enriched list (one base + 5 fan-out
  // queries, all indexed) and the unfiltered-by-risk count. The
  // count is from the old service so the "Showing X-Y of Z" line
  // and the pagination total stay exact regardless of which
  // post-filter is active.
  const nowRef = new Date();
  const actorRoles = await resolveActorRoles({ id: session.user.id }, ws.id);
  const enrichedResult = await listWorkspaceContentEnriched(
    { id: session.user.id },
    ws.id,
    {
      ...filterOpts,
      limit: pageSize,
      offset: (requestedPage - 1) * pageSize,
    },
    nowRef,
    actorRoles,
  );
  let visibleEnrichedItems = enrichedResult.items;
  // Post-fetch `risk=at_risk` filter. The strict-overdue definition
  // (ADR-0006) excludes drafts and `blocked` so the filtered list
  // matches the KPI bar.
  if (filters.risk === "at_risk") {
    visibleEnrichedItems = visibleEnrichedItems.filter(
      (item) =>
        item.plannedPublishAt < nowRef &&
        ![
          "ready_to_publish",
          "partially_published",
          "published",
          "cancelled",
          "blocked",
          "draft",
        ].includes(item.status),
    );
  }
  const totalCount = enrichedResult.total;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  // If the requested page is past the end (e.g. user bookmarked
  // page 12 and the dataset shrunk to 3 pages), surface the empty
  // state on page 1 rather than rendering a blank grid. The URL
  // stays as the user wrote it so a reload re-resolves correctly.
  const currentPage = Math.min(requestedPage, totalPages);
  const visibleItems = currentPage === requestedPage ? visibleEnrichedItems : [];

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
  // Strict-overdue rollup (ADR-0006). `kpis.atRisk` is the historical
  // math; `healthRollup.atRisk` excludes drafts and `blocked`. The
  // KPI bar uses the strict number; the row Health column uses
  // `classifyHealth` (same source of truth). The two surfaces can
  // never disagree.
  const healthRollup = aggregateHealth({
    rows: allMonthItems.map((i) => ({
      status: i.status as KpiContentStatus,
      plannedPublishAt: i.plannedPublishAt,
    })),
    now: new Date(),
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

  // Page href builder. Preserves every filter / density param so a
  // paginated link never silently drops the user's selection. The
  // only pagination-only param is `page`; the other keys are
  // reconstructed from the known filter set so a malicious caller
  // can't inject internal params (`risk`, `density`, etc.) into the
  // link.
  const buildPageHref = (page: number) => {
    const params = new URLSearchParams();
    params.set("month", monthParam(0));
    if (page !== 1) params.set("page", String(page));
    if (selectedStatus) params.set("status", selectedStatus);
    if (selectedFormat) params.set("format", selectedFormat);
    if (ownerFilter) params.set("owner", ownerFilter);
    if (searchTerm) params.set("search", searchTerm);
    if (filters.density === "compact") params.set("density", "compact");
    return `?${params.toString()}`;
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6" data-testid="workspace-planning">
      <PageHeader
        eyebrow={ws.name}
        title={t("planning.title")}
        description={
          <>
            <span>
              {t(totalCount === 1 ? "planning.descriptionOne" : "planning.descriptionMany", {
                count: totalCount,
                month: new Intl.DateTimeFormat(dir === "rtl" ? "ar" : "en", {
                  month: "long",
                  year: "numeric",
                }).format(now),
              })}
            </span>
            <span className="text-label text-fg-muted border-border bg-surface-subtle ms-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
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
                    {t("planning.batchAdd")}
                  </Link>
                </Button>
                <Button asChild>
                  <Link href={`/app/w/${slug}/planning/new`}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    {t("planning.quickCreate")}
                  </Link>
                </Button>
              </>
            ) : null}
            {/* Switch to the board view with the same filters applied.
                Filters are re-serialised (the board has no month scope,
                so we drop the `month` key on the way across). The board
                has no density concept, so we also drop `density` and
                `page`. The destination re-renders the filter row from
                the URL. */}
            <Button
              variant="outline"
              asChild
              data-testid="planning-switch-to-board"
              title={t("planning.boardViewTitle")}
            >
              <Link
                href={(() => {
                  const params = new URLSearchParams();
                  if (selectedStatus) params.set("status", selectedStatus);
                  if (selectedFormat) params.set("format", selectedFormat);
                  if (ownerFilter) params.set("owner", ownerFilter);
                  if (searchTerm) params.set("search", searchTerm);
                  const qs = params.toString();
                  return qs ? `/app/w/${slug}/board?${qs}` : `/app/w/${slug}/board`;
                })()}
              >
                <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                {t("planning.boardView")}
              </Link>
            </Button>
            {/* FEAT-15 (GAP-FULL-REVIEW-2026-08-25) — CSV export
                of the current month's content. The link carries
                the active month so the download matches what's
                on screen. The role gate is enforced server-side
                in /api/export/content-csv. */}
            <Button variant="outline" asChild>
              <a
                href={`/api/export/content-csv?slug=${encodeURIComponent(slug)}&month=${monthParam(0)}`}
                data-testid="planning-export-csv"
                download
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                {t("planning.exportCsv")}
              </a>
            </Button>
          </div>
        }
      />

      <PlanningKpiBar
        total={kpis.totalIdeas}
        atRisk={healthRollup.atRisk}
        needsReview={kpis.needsReview}
        ready={kpis.ready}
        notStarted={healthRollup.notStarted}
        baseHref={`/app/w/${slug}/planning`}
        currentQuery={
          new URLSearchParams(
            Object.entries({ month: monthParam(0) }).filter(([, v]) => v != null) as [
              string,
              string,
            ][],
          )
        }
        t={t}
      />

      <div className="border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-card)] border p-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        <MonthNav month={now} buildHref={buildMonthHref} />
        <PlanningFiltersBar
          basePath={`/app/w/${slug}/planning`}
          monthParam={monthParam(0)}
          members={memberRows.map((m) => ({
            id: m.id,
            label: m.displayName ?? m.name ?? m.id.slice(0, 8),
          }))}
          channels={[]}
          t={t}
        />
      </div>

      {totalCount === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" aria-hidden="true" />}
          title={hasFilter ? t("planning.emptyFilterTitle") : t("planning.emptyNothingTitle")}
          description={
            hasFilter
              ? t("planning.emptyFilterDescription", {
                  filter: describeActiveFilter(
                    Object.fromEntries(
                      Object.entries({
                        status: selectedStatus,
                        format: selectedFormat,
                        ownerId: ownerFilter,
                        search: searchTerm,
                        risk: filters.risk,
                      }).filter(([, v]) => v != null),
                    ) as Parameters<typeof describeActiveFilter>[0],
                  ),
                })
              : t("planning.emptyNothingDescription")
          }
          action={
            hasFilter ? (
              <Button variant="outline" asChild>
                <Link
                  href={`/app/w/${slug}/planning?month=${monthParam(0)}`}
                  data-testid="planning-empty-clear-filters"
                >
                  {t("planning.clearFilters")}
                </Link>
              </Button>
            ) : canCreate ? (
              <Button asChild>
                <Link href={`/app/w/${slug}/planning/new`}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {t("planning.quickCreate")}
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : requestedPage > totalPages ? (
        // The user asked for a page past the end of the dataset. The
        // header still shows the real total, the URL preserves the
        // user's request, but the body is a soft empty state with
        // a jump-to-page-1 affordance instead of a blank list.
        <Card padding="lg" data-testid="planning-page-out-of-range">
          <div className="flex flex-col items-start gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="text-warning h-5 w-5" aria-hidden="true" />
              <p className="text-body text-fg-primary font-semibold">
                {t("planning.outOfRangeTitle", { page: requestedPage })}
              </p>
            </div>
            <p className="text-body text-fg-secondary">
              {t(
                totalCount === 1
                  ? "planning.outOfRangeDescriptionOne"
                  : "planning.outOfRangeDescriptionMany",
                { count: totalCount, pages: totalPages },
              )}
            </p>
            <div>
              <Button asChild variant="outline" size="sm">
                <Link href={buildPageHref(1)}>{t("planning.goToPageOne")}</Link>
              </Button>
            </div>
          </div>
        </Card>
      ) : visibleItems.length === 0 ? (
        // Page exists (1-indexed within totalPages) but the post-fetch
        // `risk=at_risk` filter eliminated every row on this page.
        <EmptyState
          icon={<FileText className="h-8 w-8" aria-hidden="true" />}
          title={t("planning.noAtRiskTitle")}
          description={t("planning.noAtRiskDescription")}
          action={
            <Button variant="outline" asChild>
              <Link
                href={`/app/w/${slug}/planning?month=${monthParam(0)}`}
                data-testid="planning-empty-clear-filters"
              >
                {t("planning.clearFilters")}
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <PlanningListGrouped
            items={visibleItems}
            workspaceSlug={slug}
            workspaceTimezone={ws.timezone}
            density={density}
            now={nowRef}
            grouped={!hasFilter}
            actions={(it) => (
              <PlanningListActions
                workspaceSlug={slug}
                itemId={it.id}
                itemTitle={it.title}
                status={it.status}
                canEdit={canCreate && (it.status === "draft" || it.status === "changes_requested")}
                canSubmit={canCreate}
                canArchive={canCreate}
              />
            )}
          />
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            buildHref={buildPageHref}
            totalCount={totalCount}
            pageSize={pageSize}
            t={t}
          />
        </>
      )}
    </div>
  );
}

// Lightweight, local import for the out-of-range card. Keeping the
// import block at the top of the file would surface it in every
// other test, so the lazy-require pattern keeps the diff scoped.
import { Card } from "@/components/ui/card";
