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
import { PlanningViewToggle } from "@/components/workspace/planning-view-toggle";
import { ReviewRow, type ReviewRowItem } from "@/components/workspace/review-row";

export default async function ReviewsQueuePage({ params }: { params: Promise<{ slug: string }> }) {
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
            inArray(approvalRequests.gate, gates),
          ),
        )
    : [];
  const overdueCount = rows.filter((r) => r.dueAt && r.dueAt < new Date()).length;
  const nowMs = new Date().getTime();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={workspace.name}
        title="Reviews queue"
        description={
          <>
            {rows.length} decision{rows.length === 1 ? "" : "s"} waiting for you.
            <span className="text-label text-fg-muted border-border bg-surface-subtle ml-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {workspace.timezone}
            </span>
          </>
        }
        action={<PlanningViewToggle workspaceSlug={slug} />}
      />

      <section aria-label="Reviews KPIs" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiTile
          icon={<Inbox className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Pending"
          value={rows.length}
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
          value={rows.length - overdueCount}
        />
      </section>

      {rows.length ? (
        <Card padding="none">
          <ul className="divide-border divide-y">
            {rows.map((row) => (
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
            title="You're all caught up"
            description="New content and creative review requests will appear here."
          />
        </Card>
      )}
    </div>
  );
}
