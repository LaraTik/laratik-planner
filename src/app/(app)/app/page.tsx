import Link from "next/link";
import { and, eq, isNull, or } from "drizzle-orm";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Plus,
  Sparkles,
} from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { contentItems, workspaces } from "@/lib/db/schema";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { KpiCard } from "@/components/workspace/kpi-card";
import { ListCard, ListItem } from "@/components/workspace/list-item";
import { PageHeader } from "@/components/workspace/page-header";
import { StatusBadge } from "@/components/content/status-badge";
import { KpiContentStatus, calculateOverviewMetrics } from "@/lib/dashboard/kpis";

/**
 * My Work — Stitch-aligned personal dashboard.
 *
 * Stitch design (project 5403097764334458790, screen `f4dc67d1`):
 *   header: "My Work" + today's date
 *   5 KPI tiles: Assigned to me / Awaiting my review / Mentions / At risk / Ready
 *   left column (8 cols): "Needs your attention" list
 *   right column (4 cols): upcoming panels
 *
 * v1 ships 4 KPIs (no "Mentions" — we don't have that data model),
 * the "Needs attention" list, and an "Upcoming this week" panel. v0
 * kept a single list; the rewrite makes the KPI tiles actionable
 * (each links to a filtered view) and surfaces overdue items first.
 */
export const metadata = { title: "My Work" };

export default async function MyWorkPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = session.user.id;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const nowMs = now.getTime();

  // My Work is scoped to the ACTIVE agency only. A user who belongs
  // to multiple agencies sees items from the agency they are
  // currently in — the agency switcher in the sidebar is the
  // canonical way to see another agency's queue. The previous
  // behavior (no agency filter) leaked cross-tenant data: the
  // "Needs attention" list would surface items from another
  // agency, and clicking one would navigate to a workspace URL
  // that the WorkspaceLayout re-resolves to the active agency,
  // so the page would 404 the idea and the user would see the
  // error page. Scoping at the data layer is the correct fix.
  const ctx = await resolveActiveAgencyContext({ actor: { id: userId } });
  const activeAgencyId = ctx?.agencyId ?? null;
  if (!activeAgencyId) return null;

  // Pull every item I have any stake in (owner / designer / reviewer)
  // WITHIN the active agency, archive-free. Capped at 200 to keep the
  // page snappy; the KPI tiles and "Needs attention" list don't need
  // more than that.
  const myItems = await db
    .select({
      id: contentItems.id,
      title: contentItems.title,
      status: contentItems.status,
      format: contentItems.format,
      plannedPublishAt: contentItems.plannedPublishAt,
      workspaceName: workspaces.name,
      workspaceSlug: workspaces.slug,
      ownerId: contentItems.contentOwnerId,
      designerId: contentItems.designerId,
      contentReviewerId: contentItems.contentReviewerId,
      internalCreativeReviewerId: contentItems.internalCreativeReviewerId,
      clientReviewerId: contentItems.clientReviewerId,
    })
    .from(contentItems)
    .innerJoin(workspaces, eq(workspaces.id, contentItems.workspaceId))
    .where(
      and(
        eq(workspaces.agencyId, activeAgencyId),
        isNull(contentItems.archivedAt),
        or(
          eq(contentItems.contentOwnerId, userId),
          eq(contentItems.designerId, userId),
          eq(contentItems.contentReviewerId, userId),
          eq(contentItems.internalCreativeReviewerId, userId),
          eq(contentItems.clientReviewerId, userId),
        ),
      ),
    )
    .limit(200);

  // KPIs — reuse the workspace calculator so the math stays consistent
  // with the Overview screen.
  const overview = calculateOverviewMetrics({
    now,
    monthlyTarget: null,
    items: myItems.map((i) => ({
      status: i.status as KpiContentStatus,
      plannedPublishAt: i.plannedPublishAt,
      format: i.format as Parameters<typeof calculateOverviewMetrics>[0]["items"][number]["format"],
    })),
  });

  const assignedToMe = myItems.length;
  const awaitingMyReview = myItems.filter(
    (i) =>
      (i.contentReviewerId === userId || i.internalCreativeReviewerId === userId) &&
      (i.status === "content_review" || i.status === "creative_review"),
  ).length;
  const atRisk = overview.atRiskCount;
  const readyToPublish = overview.readyToPublish;

  // "Needs your attention" — items that are mine AND at risk, plus any
  // review I'm assigned to that's overdue (planned date in the past).
  const needsAttention = myItems
    .filter((i) => {
      if (
        i.status === "ready_to_publish" ||
        i.status === "partially_published" ||
        i.status === "published"
      )
        return false;
      const planned = i.plannedPublishAt.getTime();
      const isOverdue = planned < nowMs;
      const isMyReview =
        (i.contentReviewerId === userId || i.internalCreativeReviewerId === userId) &&
        (i.status === "content_review" || i.status === "creative_review");
      return isOverdue || isMyReview;
    })
    .sort((a, b) => a.plannedPublishAt.getTime() - b.plannedPublishAt.getTime())
    .slice(0, 8);

  // "Upcoming this week" — items planned in the next 7 days, sorted
  // by planned date ascending. Capped at 6.
  const upcoming = myItems
    .filter(
      (i) =>
        i.plannedPublishAt.getTime() >= nowMs &&
        i.plannedPublishAt.getTime() <= weekEnd.getTime() &&
        i.status !== "published" &&
        i.status !== "cancelled",
    )
    .sort((a, b) => a.plannedPublishAt.getTime() - b.plannedPublishAt.getTime())
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Work"
        description={now.toLocaleDateString(undefined, {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href="/app/workspaces/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              New workspace
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="my-work-kpi-row">
        {/*
         * The KPIs on My Work are cross-workspace — they aggregate
         * every workspace the user has a stake in — so there is no
         * single `/app/w/[slug]/planning|reviews` href to point at.
         * Render them as display tiles; the workspace list and each
         * workspace's own Overview provide the actionable deep links.
         */}
        <KpiCard
          label="Assigned to me"
          value={assignedToMe}
          icon={<FileText className="h-4 w-4" aria-hidden="true" />}
        />
        <KpiCard
          label="Awaiting my review"
          value={awaitingMyReview}
          icon={<Eye className="h-4 w-4" aria-hidden="true" />}
        />
        <KpiCard
          label="At risk"
          value={atRisk}
          icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
          danger
        />
        <KpiCard
          label="Ready to publish"
          value={readyToPublish}
          icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
        />
      </div>

      {myItems.length === 0 ? (
        <Card variant="dashed" padding="lg">
          <EmptyState
            icon={<Sparkles className="h-8 w-8" aria-hidden="true" />}
            title="Nothing assigned yet"
            description="Once a planner creates content and assigns it to you, it'll show up here. You can also start by creating a workspace."
            action={
              <Button asChild>
                <Link href="/app/workspaces/new">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Create a workspace
                </Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-8">
            <h2 className="text-title-section text-fg-primary inline-flex items-center gap-2 font-semibold">
              <AlertTriangle className="text-warning h-5 w-5" aria-hidden="true" />
              Needs your attention
            </h2>
            {needsAttention.length === 0 ? (
              <Card variant="dashed" padding="md">
                <p className="text-body text-fg-muted">
                  Nothing overdue. You&rsquo;re on top of it.
                </p>
              </Card>
            ) : (
              <ListCard data-testid="my-work-needs-attention">
                {needsAttention.map((item) => (
                  <ListItem
                    key={item.id}
                    href={`/app/w/${item.workspaceSlug}/planning/${item.id}`}
                    leading={<FileText className="text-fg-muted h-4 w-4" aria-hidden="true" />}
                    title={item.title}
                    meta={
                      <>
                        <span className="truncate">{item.workspaceName}</span>
                        <span aria-hidden="true"> · </span>
                        <span className="inline-flex shrink-0 items-center gap-1 align-middle">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          {item.plannedPublishAt.toLocaleDateString()}
                        </span>
                      </>
                    }
                    trailing={<StatusBadge status={item.status} />}
                  />
                ))}
              </ListCard>
            )}
          </div>

          <div className="space-y-3 lg:col-span-4">
            <h2 className="text-title-section text-fg-primary inline-flex items-center gap-2 font-semibold">
              <Calendar className="text-fg-secondary h-5 w-5" aria-hidden="true" />
              Upcoming this week
            </h2>
            {upcoming.length === 0 ? (
              <Card variant="dashed" padding="md">
                <p className="text-body text-fg-muted">No items planned in the next 7 days.</p>
              </Card>
            ) : (
              <ListCard>
                {upcoming.map((item) => (
                  <ListItem
                    key={item.id}
                    href={`/app/w/${item.workspaceSlug}/planning/${item.id}`}
                    density="compact"
                    title={item.title}
                    meta={
                      <>
                        <span className="truncate">{item.workspaceName}</span>
                        <span aria-hidden="true"> · </span>
                        <span>{item.plannedPublishAt.toLocaleDateString()}</span>
                      </>
                    }
                    trailing={<StatusBadge status={item.status} />}
                  />
                ))}
              </ListCard>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
