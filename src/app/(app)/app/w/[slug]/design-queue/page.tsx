import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { listUnassignedDesignWork } from "@/lib/content/service";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { StatusBadge } from "@/components/content/status-badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/workspace/page-header";
import { Clock, Paintbrush } from "lucide-react";

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
      {rows.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={`/app/w/${slug}/planning/${row.id}`}
              className="border-border bg-surface hover:border-primary focus-visible:ring-focus-ring rounded-[var(--radius-card)] border p-4 transition-colors focus:outline-none focus-visible:ring-2"
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
        <Card variant="dashed" padding="lg">
          <EmptyState
            icon={<Paintbrush className="h-8 w-8" />}
            title="No unassigned work"
            description="Approved ideas with no designer will appear here."
          />
        </Card>
      )}
    </div>
  );
}
