import Link from "next/link";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { contentItems, workspaces } from "@/lib/db/schema";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { statusBadgeVariant, humanStatus } from "@/lib/content/status";
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
            <Button asChild>
              <Link href="/app/workspaces/new">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create a workspace
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-title-page text-fg-primary font-semibold">My Work</h1>
          <p className="text-body text-fg-secondary mt-1">
            {myItems.length} item{myItems.length === 1 ? "" : "s"} assigned to you, ordered by
            planned publish time.
          </p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href="/app/workspaces/new">
            <Plus className="h-4 w-4" aria-hidden="true" />
            New workspace
          </Link>
        </Button>
      </header>

      <ul className="border-border bg-surface divide-border divide-y overflow-hidden rounded-[var(--radius-card)] border">
        {myItems.map((item) => (
          <li
            key={item.id}
            className="hover:bg-surface-subtle focus-within:bg-surface-subtle transition"
          >
            <Link
              href={`/app/w/${item.workspaceSlug}/planning/${item.id}`}
              className="flex items-center gap-3 px-4 py-3 sm:gap-4"
            >
              <FileText
                className="text-fg-muted hidden h-4 w-4 shrink-0 sm:block"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <span className="text-body text-fg-primary block truncate font-semibold">
                  {item.title}
                </span>
                <div className="text-label text-fg-muted mt-0.5 flex items-center gap-2">
                  <span className="truncate">{item.workspaceName}</span>
                  <span aria-hidden="true">·</span>
                  <span className="flex shrink-0 items-center gap-1">
                    <Calendar className="h-3 w-3" aria-hidden="true" />
                    {item.plannedPublishAt.toLocaleDateString()}
                  </span>
                </div>
              </div>
              <Badge variant={statusBadgeVariant(item.status)}>{humanStatus(item.status)}</Badge>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
