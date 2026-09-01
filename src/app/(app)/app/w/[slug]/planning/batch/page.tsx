import { redirect, notFound } from "next/navigation";
import { Clock } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { PageHeader } from "@/components/workspace/page-header";
import { BatchForm } from "./batch-form";
import { tForActive } from "@/lib/i18n/t-for-active";

export default async function BatchAddPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  if (
    !(await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
      "workspace_manager",
      "content_planner",
    ]))
  )
    notFound();
  const { t } = await tForActive();
  return (
    <div className="mx-auto max-w-3xl space-y-6" data-testid="workspace-planning-batch">
      <PageHeader
        eyebrow={workspace.name}
        title={t("batchAdd.title")}
        description={
          <>
            {t("batchAdd.description")}
            <span className="text-label text-fg-muted border-border bg-surface-subtle ms-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {workspace.timezone}
            </span>
          </>
        }
      />
      <BatchForm slug={slug} />
    </div>
  );
}
