import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
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
      <header>
        <p className="text-label text-fg-muted">{workspace.name}</p>
        <h1 className="text-title-page font-semibold">Batch add</h1>
        <p className="text-body text-fg-secondary mt-1">
          Paste up to 50 ideas. All active channels and workspace defaults are applied
          automatically. The batch is atomic.
        </p>
      </header>
      <BatchForm slug={slug} />
    </div>
  );
}
