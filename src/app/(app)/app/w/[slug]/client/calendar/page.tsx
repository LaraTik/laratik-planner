import { redirect, notFound } from "next/navigation";
import { and, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { Clock } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { contentItems } from "@/lib/db/schema";
import { getClientWorkspace } from "@/lib/workspaces/context";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/workspace/page-header";
import { StatusBadge } from "@/components/content/status-badge";

export default async function ClientCalendarPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getClientWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["client_reviewer"])))
    notFound();
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  const rows = await db
    .select({
      id: contentItems.id,
      title: contentItems.title,
      format: contentItems.format,
      status: contentItems.status,
      plannedPublishAt: contentItems.plannedPublishAt,
    })
    .from(contentItems)
    .where(
      and(
        eq(contentItems.workspaceId, workspace.id),
        isNull(contentItems.archivedAt),
        gte(contentItems.plannedPublishAt, start),
        lt(contentItems.plannedPublishAt, end),
        inArray(contentItems.status, [
          "creative_review",
          "ready_to_publish",
          "partially_published",
          "published",
        ]),
      ),
    );
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={workspace.name}
        title="Client calendar"
        description={
          <>
            Read-only approved and review-stage content for this month.
            <span className="text-label text-fg-muted border-border bg-surface-subtle ml-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {workspace.timezone}
            </span>
          </>
        }
      />
      <Card padding="none">
        <ul className="divide-border divide-y">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 p-4 sm:gap-4">
              <time className="bg-surface-subtle text-label flex h-12 w-12 flex-col items-center justify-center rounded-[var(--radius-control)]">
                <strong className="text-title-card">{row.plannedPublishAt.getDate()}</strong>
                {row.plannedPublishAt.toLocaleString("default", { month: "short" })}
              </time>
              <div className="min-w-0 flex-1">
                <p className="text-body font-semibold">{row.title}</p>
                <p className="text-label text-fg-secondary">{row.format.replace(/_/g, " ")}</p>
              </div>
              <StatusBadge status={row.status} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
