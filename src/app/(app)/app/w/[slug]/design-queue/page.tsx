import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { listUnassignedDesignWork } from "@/lib/content/service";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { PageHeader } from "@/components/workspace/page-header";
import { Clock } from "lucide-react";
import { DesignQueueList, type DesignQueueListItem } from "./design-queue-list";

export default async function DesignQueuePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  // FEAT-12 (GAP-FULL-REVIEW-2026-08-25) — delegate to the
  // canonical §14 `listUnassignedDesignWork` query so the page
  // picks up the role-gate, future cursor support, and any
  // downstream filters without further changes here.
  const rows = await listUnassignedDesignWork({ id: session.user.id }, workspace.id);
  // FEAT-14 (GAP-FULL-REVIEW-2026-08-25) — only the planner /
  // manager sees the bulk-action toolbar. Designers still see
  // the queue (so they can claim) but cannot archive in bulk.
  const canBulkArchive = await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
    "workspace_manager",
    "content_planner",
  ]);
  const items: DesignQueueListItem[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    plannedPublishAtIso: r.plannedPublishAt.toISOString(),
    href: `/app/w/${slug}/planning/${r.id}`,
  }));
  return (
    <div className="space-y-6" data-testid="workspace-design-queue">
      <PageHeader
        eyebrow={workspace.name}
        title="Unassigned design queue"
        description={
          <>
            Approved ideas waiting for a designer to claim or be assigned.
            <span className="text-label text-fg-muted border-border bg-surface-subtle ml-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {workspace.timezone}
            </span>
          </>
        }
      />
      <DesignQueueList workspaceId={workspace.id} items={items} canBulkArchive={canBulkArchive} />
    </div>
  );
}
