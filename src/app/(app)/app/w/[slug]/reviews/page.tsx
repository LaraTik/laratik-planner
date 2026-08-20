import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { approvalRequests, contentItems } from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/workspace/page-header";
import { ClipboardCheck } from "lucide-react";

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
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={workspace.name}
        title="Reviews queue"
        description={`${rows.length} decision${rows.length === 1 ? "" : "s"} waiting for you.`}
      />
      {rows.length ? (
        <Card padding="none">
          <ul className="divide-border divide-y">
            {rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/app/w/${slug}/planning/${row.contentId}`}
                  className="hover:bg-surface-subtle focus-visible:bg-surface-subtle flex flex-wrap items-center gap-3 px-4 py-3 focus:outline-none sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-body text-fg-primary truncate font-semibold">{row.title}</p>
                    <p className="text-label text-fg-muted mt-1">
                      Requested {row.requestedAt.toLocaleDateString()}
                      {row.dueAt ? ` · due ${row.dueAt.toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <Badge variant={row.dueAt && row.dueAt < new Date() ? "danger" : "info"}>
                    <ClipboardCheck className="h-3 w-3" />
                    {row.gate.replace(/_/g, " ")}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card variant="dashed" padding="lg">
          <EmptyState
            icon={<ClipboardCheck className="h-8 w-8" />}
            title="You’re all caught up"
            description="New content and creative review requests will appear here."
          />
        </Card>
      )}
    </div>
  );
}
