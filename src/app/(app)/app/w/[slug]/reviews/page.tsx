import { redirect, notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { Calendar, Clock, Inbox } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { approvalRequests, contentItems } from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card } from "@/components/ui/card";
import { KpiTile } from "@/components/workspace/kpi-tile";
import { PageHeader } from "@/components/workspace/page-header";
import { ReviewsFilters } from "@/components/workspace/reviews-filters";
import { ReviewRow, type ReviewRowItem } from "@/components/workspace/review-row";

type Gate = "content" | "creative_internal" | "creative_client";
type SortKey = "requested_desc" | "due_asc" | "due_desc";

export default async function ReviewsQueuePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ gate?: string; sort?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const [internal, client] = await Promise.all([
    hasWorkspaceRole({ id: session.user.id }, workspace.id, ["internal_reviewer"]),
    hasWorkspaceRole({ id: session.user.id }, workspace.id, ["client_reviewer"]),
  ]);
  const gates = [
    ...(internal ? (["content", "creative_internal"] as const) : []),
    ...(client ? (["creative_client"] as const) : []),
  ];
  const params2 = await searchParams;
  const requestedGate = params2.gate as Gate | undefined;
  const sort: SortKey =
    params2.sort === "due_asc" || params2.sort === "due_desc" ? params2.sort : "requested_desc";
  const activeGate =
    requestedGate && (gates as readonly string[]).includes(requestedGate)
      ? requestedGate
      : undefined;
  const rows = gates.length
    ? await db
        .select({
          id: approvalRequests.id,
          gate: approvalRequests.gate,
          dueAt: approvalRequests.dueAt,
          requestedAt: approvalRequests.requestedAt,
          contentId: contentItems.id,
          title: contentItems.title,
          format: contentItems.format,
        })
        .from(approvalRequests)
        .innerJoin(contentItems, eq(contentItems.id, approvalRequests.contentItemId))
        .where(
          and(
            eq(contentItems.workspaceId, workspace.id),
            eq(approvalRequests.status, "pending"),
            inArray(approvalRequests.gate, activeGate ? [activeGate] : gates),
          ),
        )
    : [];
  const sortedRows = [...rows].sort((a, b) => {
    if (sort === "due_asc" || sort === "due_desc") {
      const aDue = a.dueAt ? a.dueAt.getTime() : Number.POSITIVE_INFINITY;
      const bDue = b.dueAt ? b.dueAt.getTime() : Number.POSITIVE_INFINITY;
      if (aDue !== bDue) return sort === "due_asc" ? aDue - bDue : bDue - aDue;
    }
    return b.requestedAt.getTime() - a.requestedAt.getTime();
  });
  const overdueCount = sortedRows.filter((r) => r.dueAt && r.dueAt < new Date()).length;
  const nowMs = new Date().getTime();
  return (
    <div className="space-y-6" data-testid="reviews-kpi-row">
      <PageHeader
        eyebrow={workspace.name}
        title="Approvals"
        description={
          <>
            {sortedRows.length} decision{sortedRows.length === 1 ? "" : "s"} waiting for you.
            <span className="text-label text-fg-muted border-border bg-surface-subtle ms-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {workspace.timezone}
            </span>
          </>
        }
      />

      <section aria-label="Reviews KPIs" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiTile
          icon={<Inbox className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Pending"
          value={sortedRows.length}
        />
        <KpiTile
          icon={<Calendar className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Overdue"
          value={overdueCount}
          tone={overdueCount > 0 ? "danger" : "default"}
        />
        <KpiTile
          icon={<Clock className="h-3.5 w-3.5" aria-hidden="true" />}
          label="On time"
          value={sortedRows.length - overdueCount}
        />
      </section>

      <ReviewsFilters
        slug={slug}
        gates={gates}
        selectedGate={activeGate}
        selectedSort={sort}
        hasFilter={Boolean(activeGate) || sort !== "requested_desc"}
      />

      {sortedRows.length ? (
        <Card padding="none">
          <ul className="divide-border divide-y">
            {sortedRows.map((row) => (
              <ReviewRow
                key={row.id}
                item={
                  {
                    id: row.id,
                    contentId: row.contentId,
                    title: row.title,
                    format: row.format,
                    requestedAt: row.requestedAt,
                    dueAt: row.dueAt,
                    gate: row.gate,
                  } satisfies ReviewRowItem
                }
                workspaceSlug={slug}
                nowMs={nowMs}
              />
            ))}
          </ul>
        </Card>
      ) : (
        <Card variant="dashed" padding="lg">
          <EmptyState
            icon={<Inbox className="h-8 w-8" />}
            title={activeGate ? "No items match this filter" : "You're all caught up"}
            description={
              activeGate
                ? "Try clearing the filter to see all reviews waiting for you."
                : "New content and creative review requests will appear here."
            }
          />
        </Card>
      )}
    </div>
  );
}
