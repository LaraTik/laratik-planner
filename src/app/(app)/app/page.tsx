import Link from "next/link";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { contentAssignments, contentItems, workspaces } from "@/lib/db/schema";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { Calendar, FileText, Plus } from "lucide-react";

/**
 * My Work — items assigned to or owned by the current user across all
 * workspaces. The "first day" experience per master prompt §3.
 */
export const metadata = { title: "My Work" };

export default async function MyWorkPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = session.user.id;

  // Items where I'm owner / designer / reviewer
  const myItems = await db
    .select({
      id: contentItems.id,
      title: contentItems.title,
      status: contentItems.status,
      format: contentItems.format,
      plannedPublishAt: contentItems.plannedPublishAt,
      workspaceName: workspaces.name,
      workspaceSlug: workspaces.slug,
    })
    .from(contentItems)
    .innerJoin(workspaces, eq(workspaces.id, contentItems.workspaceId))
    .where(
      and(
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
    .orderBy(desc(contentItems.plannedPublishAt))
    .limit(50);

  // Quiet unused import
  void contentAssignments;
  void sql;

  if (myItems.length === 0) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-title-page text-fg-primary font-semibold">My Work</h1>
          <p className="text-body text-fg-secondary mt-1">
            Content you own, design, or review. Empty for now — your day starts here.
          </p>
        </header>
        <EmptyState
          icon={<FileText className="h-8 w-8" aria-hidden="true" />}
          title="Nothing assigned yet"
          description="Once a planner creates content and assigns it to you, it'll show up here. You can also start by creating a workspace."
          action={
            <Link
              href="/app/workspaces/new"
              className="bg-primary hover:bg-primary-hover text-body inline-flex items-center gap-2 rounded-[var(--radius-control)] px-4 py-2 font-semibold text-white"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create a workspace
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-title-page text-fg-primary font-semibold">My Work</h1>
          <p className="text-body text-fg-secondary mt-1">
            {myItems.length} item{myItems.length === 1 ? "" : "s"} assigned to you, ordered by
            planned publish time.
          </p>
        </div>
        <Link
          href="/app/workspaces/new"
          className="text-body text-primary border-primary/20 bg-primary-subtle hover:bg-primary/10 inline-flex items-center gap-2 rounded-[var(--radius-control)] border px-3 py-1.5 font-semibold"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New workspace
        </Link>
      </header>

      <ul className="border-border bg-surface divide-border divide-y overflow-hidden rounded-[var(--radius-card)] border">
        {myItems.map((item) => (
          <li
            key={item.id}
            className="hover:bg-surface-subtle flex items-center gap-4 px-4 py-3 transition"
          >
            <div className="min-w-0 flex-1">
              <Link
                href={`/app/w/${item.workspaceSlug}/content/${item.id}`}
                className="text-body text-fg-primary block truncate font-semibold"
              >
                {item.title}
              </Link>
              <div className="text-label text-fg-muted mt-0.5 flex items-center gap-2">
                <span>{item.workspaceName}</span>
                <span aria-hidden="true">·</span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" aria-hidden="true" />
                  {item.plannedPublishAt.toLocaleDateString()}
                </span>
              </div>
            </div>
            <Badge variant={statusVariant(item.status)}>{humanStatus(item.status)}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

function humanStatus(s: string): string {
  return s.replace(/_/g, " ");
}

function statusVariant(
  s: string,
): "default" | "primary" | "success" | "warning" | "danger" | "info" {
  if (s === "published" || s === "ready_to_publish") return "success";
  if (s === "blocked" || s === "cancelled") return "danger";
  if (s === "changes_requested") return "warning";
  if (s === "in_design" || s === "creative_review" || s === "content_review") return "info";
  if (s === "partially_published" || s === "approved_for_design") return "primary";
  return "default";
}
