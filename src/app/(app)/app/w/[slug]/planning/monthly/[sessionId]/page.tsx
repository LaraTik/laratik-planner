import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { getMonthlyPlanningSession } from "@/lib/ai/monthly-planning";
import { tForActive } from "@/lib/i18n/t-for-active";
import { PageHeader } from "@/components/workspace/page-header";
import { MonthlyPlanningClient } from "./monthly-planning-client";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await tForActive();
  return { title: t("monthlyPlanning.sessionTitle") };
}

export default async function MonthlyPlanningSessionPage({
  params,
}: {
  params: Promise<{ slug: string; sessionId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug, sessionId } = await params;
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
  const data = await getMonthlyPlanningSession({ id: session.user.id }, workspace.id, sessionId);
  if (!data) notFound();
  return (
    <div className="space-y-5" data-testid="monthly-planning-session">
      <PageHeader
        eyebrow={`${workspace.name} · ${data.session.month}`}
        title={t("monthlyPlanning.sessionTitle")}
        description={t("monthlyPlanning.sessionDescription")}
      />
      <MonthlyPlanningClient
        workspaceId={workspace.id}
        sessionId={data.session.id}
        initialStage={data.session.status}
        initialMessages={data.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
        }))}
        initialProposal={
          data.proposals[0]
            ? {
                id: data.proposals[0].id,
                status: data.proposals[0].status,
                proposal: data.proposals[0].proposal,
              }
            : null
        }
      />
    </div>
  );
}
