import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { PageHeader } from "@/components/workspace/page-header";
import { BatchForm } from "./batch-form";

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
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow={workspace.name}
        title="Batch add"
        description="Paste up to 50 ideas. All active channels and workspace defaults are applied automatically. The batch is atomic."
      />
      <BatchForm slug={slug} />
    </div>
  );
}
