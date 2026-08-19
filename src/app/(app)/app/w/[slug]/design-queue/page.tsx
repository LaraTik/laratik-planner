import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { contentItems } from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { ScreenHeading } from "@/components/workspace/screen-heading";
import { StatusBadge } from "@/components/content/status-badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { Paintbrush } from "lucide-react";

export default async function DesignQueuePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const rows = await db
    .select()
    .from(contentItems)
    .where(
      and(
        eq(contentItems.workspaceId, workspace.id),
        eq(contentItems.status, "approved_for_design"),
        isNull(contentItems.designerId),
        isNull(contentItems.archivedAt),
      ),
    );
  return (
    <div className="space-y-6">
      <ScreenHeading
        eyebrow={workspace.name}
        title="Unassigned design queue"
        description="Approved ideas waiting for a designer to claim or be assigned."
      />
      {rows.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={`/app/w/${slug}/planning/${row.id}`}
              className="border-border bg-surface hover:border-primary rounded-[var(--radius-card)] border p-4"
            >
              <p className="text-body text-fg-primary font-semibold">{row.title}</p>
              <p className="text-label text-fg-muted my-3">
                Publish {row.plannedPublishAt.toLocaleDateString()}
              </p>
              <StatusBadge status={row.status} />
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Paintbrush className="h-8 w-8" />}
          title="No unassigned work"
          description="Approved ideas with no designer will appear here."
        />
      )}
    </div>
  );
}
