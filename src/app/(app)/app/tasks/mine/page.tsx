import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { tForActive } from "@/lib/i18n/t-for-active";
import { TaskListPage } from "@/components/tasks/task-list-page";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await tForActive();
  return { title: t("tasks.myTitle") };
}

export default async function MyTasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { t, code } = await tForActive();
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  const context = await resolveActiveAgencyContext({ actor });
  if (!context) redirect("/setup");
  return (
    <TaskListPage
      actor={actor}
      agencyId={context.agencyId}
      mine
      searchParams={await searchParams}
      t={t}
      code={code}
    />
  );
}
