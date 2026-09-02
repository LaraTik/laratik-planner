import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { and, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { Clock } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { contentItems } from "@/lib/db/schema";
import { getClientWorkspace } from "@/lib/workspaces/context";
import { tForActive } from "@/lib/i18n/t-for-active";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await tForActive();
  return { title: t("sidebar.clientCalendarPage.title") };
}
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/workspace/page-header";
import { StatusBadge } from "@/components/content/status-badge";
import { humanFormat } from "@/lib/content/status";
import { formatDate } from "@/lib/i18n/format-locale";

export default async function ClientCalendarPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { t, code } = await tForActive();
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getClientWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["client_reviewer"])))
    notFound();
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  const rows = await db
    .select({
      id: contentItems.id,
      title: contentItems.title,
      format: contentItems.format,
      status: contentItems.status,
      plannedPublishAt: contentItems.plannedPublishAt,
    })
    .from(contentItems)
    .where(
      and(
        eq(contentItems.workspaceId, workspace.id),
        isNull(contentItems.archivedAt),
        gte(contentItems.plannedPublishAt, start),
        lt(contentItems.plannedPublishAt, end),
        inArray(contentItems.status, [
          "creative_review",
          "ready_to_publish",
          "partially_published",
          "published",
        ]),
      ),
    );
  return (
    <div className="space-y-6" data-testid="workspace-client-calendar">
      <PageHeader
        eyebrow={workspace.name}
        title={t("sidebar.clientCalendarPage.title")}
        description={
          <>
            {t("sidebar.clientCalendarPage.subtitle")}
            <span className="text-label text-fg-muted border-border bg-surface-subtle ms-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {workspace.timezone}
            </span>
          </>
        }
      />
      <Card padding="none">
        <ul className="divide-border divide-y">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 p-4 sm:gap-4">
              <time className="bg-surface-subtle text-label flex h-12 w-12 flex-col items-center justify-center rounded-[var(--radius-control)]">
                <strong className="text-title-card">{row.plannedPublishAt.getDate()}</strong>
                {formatDate(row.plannedPublishAt, code, { month: "short" })}
              </time>
              <div className="min-w-0 flex-1">
                <p className="text-body font-semibold">{row.title}</p>
                <p className="text-label text-fg-secondary">{humanFormat(row.format)}</p>
              </div>
              <StatusBadge status={row.status} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
