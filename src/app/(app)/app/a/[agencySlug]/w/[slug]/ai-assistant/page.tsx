import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/workspace/page-header";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { auth } from "@/lib/auth/config";
import { tForActive } from "@/lib/i18n/t-for-active";
import { getAccessibleWorkspaceAtPath } from "@/lib/workspaces/context";
import { WorkspaceAssistant } from "./workspace-assistant";

export async function generateMetadata() {
  const { t } = await tForActive();
  return { title: t("workspaceAssistant.title") };
}

export default async function WorkspaceAiAssistantPage({
  params,
}: {
  params: Promise<{ agencySlug: string; slug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { agencySlug, slug } = await params;
  const actor = { id: session.user.id };
  const workspace = await getAccessibleWorkspaceAtPath(actor, agencySlug, slug);
  if (!workspace) notFound();
  if (!(await hasWorkspaceRole(actor, workspace.id, ["workspace_manager", "content_planner"]))) {
    notFound();
  }
  const { t, code } = await tForActive();

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("workspaceAssistant.title")}
        description={t("workspaceAssistant.description")}
      />
      <WorkspaceAssistant
        workspaceSlug={workspace.slug}
        locale={code}
        labels={{
          emptyTitle: t("workspaceAssistant.emptyTitle"),
          emptyDescription: t("workspaceAssistant.emptyDescription"),
          summarize: t("workspaceAssistant.summarize"),
          findGaps: t("workspaceAssistant.findGaps"),
          improve: t("workspaceAssistant.improve"),
          placeholder: t("workspaceAssistant.placeholder"),
          send: t("workspaceAssistant.send"),
          sending: t("workspaceAssistant.sending"),
          assistant: t("workspaceAssistant.assistant"),
          you: t("workspaceAssistant.you"),
          evidence: t("workspaceAssistant.evidence"),
          source: t("workspaceAssistant.source"),
          capturedAt: t("workspaceAssistant.capturedAt"),
          itemCount: t("workspaceAssistant.itemCount"),
          boundedData: t("workspaceAssistant.boundedData"),
          completeData: t("workspaceAssistant.completeData"),
          limitations: t("workspaceAssistant.limitations"),
          error: t("workspaceAssistant.error"),
          privacy: t("workspaceAssistant.privacy"),
          readOnly: t("workspaceAssistant.readOnly"),
        }}
      />
    </div>
  );
}
