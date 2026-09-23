import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { listAgencyMembers, listAgencyWorkspaces } from "@/lib/tasks/service";
import { tForActive } from "@/lib/i18n/t-for-active";
import { PageHeader } from "@/components/workspace/page-header";
import { TaskCreateForm } from "@/components/tasks/task-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await tForActive();
  return { title: t("tasks.newTitle") };
}

export default async function NewTaskPage() {
  const { t } = await tForActive();
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  const context = await resolveActiveAgencyContext({ actor });
  if (!context) redirect("/setup");
  const [members, workspaces] = await Promise.all([
    listAgencyMembers(context.agencyId),
    listAgencyWorkspaces(context.agencyId),
  ]);
  const labels: Record<string, string> = {
    titleLabel: t("tasks.titleLabel"),
    newDescription: t("tasks.newDescription"),
    titlePlaceholder: t("tasks.titlePlaceholder"),
    descriptionLabel: t("tasks.descriptionLabel"),
    descriptionPlaceholder: t("tasks.descriptionPlaceholder"),
    workspaceLabel: t("tasks.workspaceLabel"),
    noWorkspace: t("tasks.noWorkspace"),
    assigneeLabel: t("tasks.assigneeLabel"),
    noAssignee: t("tasks.noAssignee"),
    priorityLabel: t("tasks.priorityLabel"),
    dueLabel: t("tasks.dueLabel"),
    create: t("tasks.create"),
    transitionHint: t("tasks.transitionHint"),
    "priority.low": t("tasks.priority.low"),
    "priority.normal": t("tasks.priority.normal"),
    "priority.high": t("tasks.priority.high"),
    "priority.urgent": t("tasks.priority.urgent"),
  };
  return (
    <div className="space-y-6">
      <PageHeader title={t("tasks.newTitle")} description={t("tasks.newDescription")} />
      <TaskCreateForm workspaces={workspaces} members={members} labels={labels} />
    </div>
  );
}
