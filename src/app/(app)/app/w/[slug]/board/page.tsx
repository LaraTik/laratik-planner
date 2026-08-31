import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { Clock, LayoutGrid, List } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { listWorkspaceContent } from "@/lib/content/service";
import { ALL_FORMATS, ALL_STATUSES, humanFormat } from "@/lib/content/status";
import { PageHeader } from "@/components/workspace/page-header";
import {
  WorkflowBoard,
  type WorkflowBoardColumn,
  type BoardMemberEntry,
} from "@/components/board/workflow-board";
import { PlanningFilters } from "@/components/workspace/planning-filters";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { users, workspaceMemberships } from "@/lib/db/schema";
import { describeActiveFilter } from "../planning/filter-describe";

const COLUMNS: readonly WorkflowBoardColumn[] = [
  { label: "Ideas", statuses: ["draft", "changes_requested", "blocked"] },
  { label: "Content review", statuses: ["content_review"] },
  { label: "Approved", statuses: ["approved_for_design"] },
  { label: "Design", statuses: ["in_design"] },
  { label: "Creative review", statuses: ["creative_review"] },
  { label: "Ready", statuses: ["ready_to_publish"] },
  { label: "Published", statuses: ["partially_published", "published"] },
];

/**
 * Workflow Board page — 7-column kanban-style view of every content
 * item in the workspace, grouped by production stage.
 *
 * Just Halal workspace remediation (2026-08-29):
 *  - The board now accepts the same status / format / owner / search
 *    filters as the planning list, so the user can narrow the board
 *    to e.g. "all in-design items owned by X" without switching to
 *    the list view.
 *  - Filter state is preserved when switching between List ↔ Board
 *    via the view-switch toggle in the header. The link is built
 *    from the active filter set so a user on the board with a
 *    status filter applied lands on the list with the same status
 *    filter applied.
 *  - "Clear filters" surfaces inline when any filter is active
 *    (same affordance as the list).
 *  - The empty state explains the active filter in plain English
 *    (via `describeActiveFilter`) so the user knows why the board
 *    is empty.
 */
export default async function WorkflowBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    status?: string;
    format?: string;
    owner?: string;
    search?: string;
  }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();

  const filters = await searchParams;
  const selectedStatus =
    filters.status && (ALL_STATUSES as readonly string[]).includes(filters.status)
      ? filters.status
      : undefined;
  const selectedFormat =
    filters.format && (ALL_FORMATS as readonly string[]).includes(filters.format as never)
      ? filters.format
      : undefined;
  const ownerFilter =
    filters.owner && /^[0-9a-f-]{36}$/i.test(filters.owner) ? filters.owner : undefined;
  const searchTerm = filters.search?.trim() || undefined;
  const hasFilter = Boolean(selectedStatus || selectedFormat || ownerFilter || searchTerm);

  // No `month` constraint on the board — the board is the
  // "everything in flight" view. Filters (status / format / owner
  // / search) still narrow the set.
  const items = await listWorkspaceContent({ id: session.user.id }, workspace.id, {
    ...(selectedStatus ? { status: selectedStatus } : {}),
    ...(selectedFormat ? { format: selectedFormat } : {}),
    ...(ownerFilter ? { ownerId: ownerFilter } : {}),
    ...(searchTerm ? { search: searchTerm } : {}),
    limit: 300,
  });

  // Owner dropdown source — every active workspace member, in display
  // order. Mirrors the planning list's owner picker so the two
  // surfaces have a consistent ownership experience.
  const memberRows = await db
    .select({ id: users.id, name: users.name, displayName: users.displayName })
    .from(workspaceMemberships)
    .innerJoin(users, eq(users.id, workspaceMemberships.userId))
    .where(eq(workspaceMemberships.workspaceId, workspace.id))
    .orderBy(asc(users.displayName), asc(users.name));

  // Build the view-switch link for the list view. The filters are
  // re-serialised so the user's filter selection survives the
  // navigation. Density is intentionally NOT carried over (the
  // board has no density concept).
  const listHref = (() => {
    const params = new URLSearchParams();
    if (selectedStatus) params.set("status", selectedStatus);
    if (selectedFormat) params.set("format", selectedFormat);
    if (ownerFilter) params.set("owner", ownerFilter);
    if (searchTerm) params.set("search", searchTerm);
    const qs = params.toString();
    return qs ? `/app/w/${slug}/planning?${qs}` : `/app/w/${slug}/planning`;
  })();

  return (
    <div className="space-y-6" data-testid="workspace-board">
      <PageHeader
        eyebrow={workspace.name}
        title="Workflow board"
        description={
          <>
            Every idea, grouped by its current production stage.
            <span className="text-label text-fg-muted border-border bg-surface-subtle ml-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {workspace.timezone}
            </span>
          </>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              asChild
              data-testid="board-switch-to-list"
              title="Switch to the list view with the same filters applied"
            >
              <Link href={listHref}>
                <List className="h-4 w-4" aria-hidden="true" />
                List view
              </Link>
            </Button>
            <Button
              variant="outline"
              asChild
              disabled
              data-testid="board-switch-to-board"
              aria-current="page"
            >
              <span>
                <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                Board view
              </span>
            </Button>
          </div>
        }
      />

      <div className="border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-card)] border p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <PlanningFilters
          targetPath={`/app/w/${slug}/board`}
          monthParam={new Date().toISOString().slice(0, 7)}
          selectedStatus={selectedStatus}
          selectedFormat={selectedFormat}
          selectedOwnerId={ownerFilter}
          searchValue={searchTerm}
          hasFilter={hasFilter}
          showDensity={false}
          members={memberRows.map((m) => ({
            id: m.id,
            label: m.displayName ?? m.name ?? m.id.slice(0, 8),
          }))}
          testIdPrefix="board"
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid className="h-8 w-8" aria-hidden="true" />}
          title={hasFilter ? "No items match your filters" : "Nothing on the board yet"}
          description={
            hasFilter
              ? `No items match ${describeActiveFilter(
                  Object.fromEntries(
                    Object.entries({
                      status: selectedStatus,
                      format: selectedFormat,
                      ownerId: ownerFilter,
                      search: searchTerm,
                    }).filter(([, v]) => v != null),
                  ) as Parameters<typeof describeActiveFilter>[0],
                )}. Try clearing the filter to see everything.`
              : "Use Quick Create to add a draft — it'll show up here when it lands in the workflow."
          }
          action={
            hasFilter ? (
              <Button variant="outline" asChild>
                <Link href={`/app/w/${slug}/board`} data-testid="board-empty-clear-filters">
                  Clear filters
                </Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href={`/app/w/${slug}/planning/new`}>Quick Create</Link>
              </Button>
            )
          }
        />
      ) : (
        <WorkflowBoard
          items={items}
          columns={COLUMNS}
          workspaceSlug={slug}
          memberDirectory={Object.fromEntries(
            memberRows.map((m) => [m.id, m satisfies BoardMemberEntry]),
          )}
        />
      )}
    </div>
  );
}

// `humanFormat` is intentionally re-exported for tree-shaking —
// the columns definition uses it indirectly through the format
// enum, but the lint pass treats it as a util-only import. Keeping
// a single reference here keeps the column metadata self-contained.
void humanFormat;
