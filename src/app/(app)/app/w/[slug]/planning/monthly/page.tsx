import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { CalendarDays, Plus } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { monthlyPlanningSessions } from "@/lib/db/schema";
import { tForActive } from "@/lib/i18n/t-for-active";
import { PageHeader } from "@/components/workspace/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createMonthlySessionAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await tForActive();
  return { title: t("monthlyPlanning.title") };
}

export default async function MonthlyPlanningPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
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
  const sessions = await db
    .select({
      id: monthlyPlanningSessions.id,
      month: monthlyPlanningSessions.month,
      status: monthlyPlanningSessions.status,
      updatedAt: monthlyPlanningSessions.updatedAt,
    })
    .from(monthlyPlanningSessions)
    .where(eq(monthlyPlanningSessions.workspaceId, workspace.id))
    .orderBy(asc(monthlyPlanningSessions.month));
  const month = new Date().toISOString().slice(0, 7);
  return (
    <div className="space-y-6" data-testid="monthly-planning-page">
      <PageHeader
        eyebrow={workspace.name}
        title={t("monthlyPlanning.title")}
        description={t("monthlyPlanning.description")}
        action={
          <Button asChild>
            <a href={`/app/w/${slug}/planning/batch`}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("monthlyPlanning.openBatch")}
            </a>
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>{t("monthlyPlanning.startTitle")}</CardTitle>
          <CardDescription>{t("monthlyPlanning.startDescription")}</CardDescription>
        </CardHeader>
        <form
          action={createMonthlySessionAction.bind(null, slug)}
          className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end"
        >
          <div className="space-y-1">
            <label htmlFor="monthly-session-month" className="text-label font-semibold">
              {t("monthlyPlanning.month")}
            </label>
            <input
              id="monthly-session-month"
              name="month"
              type="month"
              defaultValue={month}
              required
              className="border-border bg-surface text-body h-11 rounded-[var(--radius-control)] border px-3"
            />
          </div>
          <Button type="submit">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            {t("monthlyPlanning.start")}
          </Button>
        </form>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("monthlyPlanning.sessionsTitle")}</CardTitle>
          <CardDescription>{t("monthlyPlanning.sessionsDescription")}</CardDescription>
        </CardHeader>
        <div className="divide-border divide-y">
          {sessions.length ? (
            sessions.map((item) => (
              <a
                key={item.id}
                href={`/app/w/${slug}/planning/monthly/${item.id}`}
                className="hover:bg-surface-subtle focus-visible:ring-focus-ring flex min-h-14 items-center justify-between gap-3 px-5 py-3 focus:outline-none focus-visible:ring-2"
              >
                <span>
                  <span className="text-body block font-semibold">{item.month}</span>
                  <span className="text-label text-fg-muted">
                    {item.status} · {item.updatedAt.toLocaleDateString()}
                  </span>
                </span>
                <span className="text-primary text-label font-semibold">
                  {t("monthlyPlanning.open")}
                </span>
              </a>
            ))
          ) : (
            <p className="text-body text-fg-muted p-5">{t("monthlyPlanning.empty")}</p>
          )}
        </div>
      </Card>
    </div>
  );
}
