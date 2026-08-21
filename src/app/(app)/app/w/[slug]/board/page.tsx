import { redirect, notFound } from "next/navigation";
import { Clock } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { listWorkspaceContent } from "@/lib/content/service";
import { PageHeader } from "@/components/workspace/page-header";
import { PlanningViewToggle } from "@/components/workspace/planning-view-toggle";
import { WorkflowBoard, type WorkflowBoardColumn } from "@/components/board/workflow-board";

const COLUMNS: readonly WorkflowBoardColumn[] = [
  { label: "Ideas", statuses: ["draft", "changes_requested", "blocked"] },
  { label: "Content review", statuses: ["content_review"] },
  { label: "Approved", statuses: ["approved_for_design"] },
  { label: "Design", statuses: ["in_design"] },
  { label: "Creative review", statuses: ["creative_review"] },
  { label: "Ready", statuses: ["ready_to_publish"] },
  { label: "Published", statuses: ["partially_published", "published"] },
];

export default async function WorkflowBoardPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const items = await listWorkspaceContent({ id: session.user.id }, workspace.id, { limit: 300 });
  return (
    <div className="space-y-6" data-testid="workspace-board">
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
      <WorkflowBoard items={items} columns={COLUMNS} workspaceSlug={slug} />
    </div>
  );
}
