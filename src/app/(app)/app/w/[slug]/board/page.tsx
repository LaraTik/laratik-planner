import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Clock } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { listWorkspaceContent } from "@/lib/content/service";
import { StatusBadge } from "@/components/content/status-badge";
import { PageHeader } from "@/components/workspace/page-header";
import { PlanningViewToggle } from "@/components/workspace/planning-view-toggle";
import { humanFormat } from "@/lib/content/status";

const COLUMNS = [
  { label: "Ideas", statuses: ["draft", "changes_requested", "blocked"] },
  { label: "Content review", statuses: ["content_review"] },
  { label: "Approved", statuses: ["approved_for_design"] },
  { label: "Design", statuses: ["in_design"] },
  { label: "Creative review", statuses: ["creative_review"] },
  { label: "Ready", statuses: ["ready_to_publish"] },
  { label: "Published", statuses: ["partially_published", "published"] },
] as const;

export default async function WorkflowBoardPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const items = await listWorkspaceContent({ id: session.user.id }, workspace.id, { limit: 300 });
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={workspace.name}
        title="Workflow board"
        description={
          <>
            Every idea, grouped by its current production stage.
            <span className="text-label text-fg-muted border-border bg-surface-subtle ml-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {workspace.timezone}
            </span>
          </>
        }
        action={<PlanningViewToggle workspaceSlug={slug} />}
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        {COLUMNS.map((column) => {
          const rows = items.filter((item) =>
            (column.statuses as readonly string[]).includes(item.status),
          );
          return (
            <section
              key={column.label}
              className="border-border bg-surface-subtle min-w-0 rounded-[var(--radius-card)] border p-3"
              data-testid={`board-column-${column.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <header className="mb-3 flex items-center justify-between">
                <h2 className="text-label text-fg-primary font-semibold">{column.label}</h2>
                <span
                  className="text-label text-fg-muted bg-surface border-border min-w-6 rounded-full border px-1.5 text-center font-semibold"
                  data-testid={`board-column-count-${column.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {rows.length}
                </span>
              </header>
              <div className="space-y-2">
                {rows.length ? (
                  rows.map((item) => (
                    <Link
                      key={item.id}
                      href={`/app/w/${slug}/planning/${item.id}`}
                      data-testid={`board-card-${item.id}`}
                      className="border-border bg-surface hover:border-primary focus-visible:ring-focus-ring block rounded-[var(--radius-control)] border p-3 transition-colors focus:outline-none focus-visible:ring-2"
                    >
                      <p className="text-body text-fg-primary line-clamp-2 font-semibold">
                        {item.title}
                      </p>
                      <p className="text-label text-fg-muted my-2">
                        {humanFormat(item.format)} · {item.plannedPublishAt.toLocaleDateString()}
                      </p>
                      <StatusBadge status={item.status} />
                    </Link>
                  ))
                ) : (
                  <p className="text-label text-fg-muted py-4 text-center">No items</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
