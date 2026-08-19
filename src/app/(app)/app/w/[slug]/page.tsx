import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { contentItems, workspaceSettings } from "@/lib/db/schema";
import { and, desc, eq, gte, isNull, lt } from "drizzle-orm";
import { EmptyState } from "@/components/feedback/empty-state";
import { Calendar, CheckCircle2, FileText, Gauge, Rocket, ShieldAlert } from "lucide-react";
import { calculateWorkspaceKpis } from "@/lib/dashboard/kpis";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { StatusBadge } from "@/components/content/status-badge";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";

/**
 * Workspace Overview — the master prompt's "Workspace Overview" screen.
 * Live operational dashboard for the current workspace month.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: slug };
}

export default async function WorkspaceOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const ws = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!ws) notFound();

  const zonedNow = toZonedTime(new Date(), ws.timezone);
  const year = zonedNow.getFullYear();
  const month = zonedNow.getMonth();
  const monthStart = fromZonedTime(new Date(year, month, 1, 0, 0, 0), ws.timezone);
  const monthEnd = fromZonedTime(new Date(year, month + 1, 1, 0, 0, 0), ws.timezone);

  const [recentItems, monthlyItems, settings] = await Promise.all([
    db
      .select({
        id: contentItems.id,
        title: contentItems.title,
        status: contentItems.status,
        plannedPublishAt: contentItems.plannedPublishAt,
      })
      .from(contentItems)
      .where(and(eq(contentItems.workspaceId, ws.id), isNull(contentItems.archivedAt)))
      .orderBy(desc(contentItems.plannedPublishAt))
      .limit(8),
    db
      .select({ status: contentItems.status, plannedPublishAt: contentItems.plannedPublishAt })
      .from(contentItems)
      .where(
        and(
          eq(contentItems.workspaceId, ws.id),
          isNull(contentItems.archivedAt),
          gte(contentItems.plannedPublishAt, monthStart),
          lt(contentItems.plannedPublishAt, monthEnd),
        ),
      ),
    db.select().from(workspaceSettings).where(eq(workspaceSettings.workspaceId, ws.id)).limit(1),
  ]);
  const kpis = calculateWorkspaceKpis({
    now: new Date(),
    monthlyTarget: settings[0]?.monthlyTarget ?? null,
    items: monthlyItems,
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-label text-fg-muted">Workspace</p>
          <h1 className="text-title-page text-fg-primary font-semibold">{ws.name}</h1>
          <p className="text-body text-fg-secondary mt-1">{ws.timezone}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/app/w/${slug}/planning`}
            className="border-border bg-surface text-fg-primary hover:bg-surface-subtle text-body inline-flex min-h-11 items-center rounded-[var(--radius-control)] border px-3 py-1.5 font-semibold transition"
          >
            Planning
          </Link>
          <Link
            href={`/app/w/${slug}/calendar`}
            className="border-border bg-surface text-fg-primary hover:bg-surface-subtle text-body inline-flex min-h-11 items-center rounded-[var(--radius-control)] border px-3 py-1.5 font-semibold transition"
          >
            Calendar
          </Link>
        </div>
      </header>

      <section aria-label="Monthly performance" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Total ideas"
          value={kpis.totalIdeas}
          icon={<FileText className="h-5 w-5" />}
          href={`/app/w/${slug}/planning`}
        />
        <KpiCard
          label="Ready to publish"
          value={kpis.readyToPublish}
          icon={<Rocket className="h-5 w-5" />}
          href={`/app/w/${slug}/planning?status=ready_to_publish`}
        />
        <KpiCard
          label="Published"
          value={kpis.published}
          icon={<CheckCircle2 className="h-5 w-5" />}
          href={`/app/w/${slug}/planning?status=published`}
        />
        <KpiCard
          label="At risk"
          value={kpis.atRisk}
          icon={<ShieldAlert className="h-5 w-5" />}
          href={`/app/w/${slug}/planning?risk=at_risk`}
          danger={kpis.atRisk > 0}
        />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="border-border bg-surface rounded-[var(--radius-card)] border p-5">
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-title-card text-fg-primary font-semibold">Recent items</h2>
            <Link
              href={`/app/w/${slug}/planning`}
              className="text-label text-primary underline-offset-4 hover:underline"
            >
              View all →
            </Link>
          </header>
          {recentItems.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-8 w-8" aria-hidden="true" />}
              title="No content yet"
              description="Once someone in this workspace creates a draft, it'll show up here."
            />
          ) : (
            <ul className="divide-border divide-y">
              {recentItems.map((it) => (
                <li key={it.id} className="text-body flex items-center gap-3 py-2">
                  <FileText className="text-fg-muted h-4 w-4" aria-hidden="true" />
                  <Link
                    href={`/app/w/${slug}/planning/${it.id}`}
                    className="text-fg-primary flex-1 truncate font-semibold"
                  >
                    {it.title}
                  </Link>
                  <span className="text-label text-fg-muted flex items-center gap-1">
                    <Calendar className="h-3 w-3" aria-hidden="true" />
                    {it.plannedPublishAt.toLocaleDateString()}
                  </span>
                  <StatusBadge status={it.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border-border bg-surface rounded-[var(--radius-card)] border p-5 xl:col-span-2">
          <h2 className="text-title-card text-fg-primary font-semibold">Monthly health</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            <ProgressMetric
              label="Plan coverage"
              value={kpis.coveragePercent}
              suffix="%"
              empty="Set a monthly target"
            />
            <ProgressMetric label="Delivery health" value={kpis.deliveryHealthPercent} suffix="%" />
            <div className="border-border rounded-[var(--radius-control)] border p-4">
              <Gauge
                className={kpis.onTrack ? "text-success h-6 w-6" : "text-warning h-6 w-6"}
                aria-hidden="true"
              />
              <p className="text-label text-fg-muted mt-3">Current milestone</p>
              <p className="text-title-card text-fg-primary font-semibold">
                {kpis.onTrack ? "On track" : "Needs attention"}
              </p>
              <p className="text-label text-fg-secondary mt-1">
                {kpis.atRisk
                  ? `${kpis.atRisk} overdue item${kpis.atRisk === 1 ? "" : "s"}`
                  : "No overdue work"}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  href,
  danger = false,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  href: string;
  danger?: boolean;
}) {
  return (
    <Link
      href={href}
      className="border-border bg-surface hover:border-primary rounded-[var(--radius-card)] border p-4 transition"
    >
      <div className={danger ? "text-danger" : "text-primary"}>{icon}</div>
      <p className="text-title-page text-fg-primary mt-3 font-semibold">{value}</p>
      <p className="text-label text-fg-secondary">{label}</p>
    </Link>
  );
}

function ProgressMetric({
  label,
  value,
  suffix,
  empty,
}: {
  label: string;
  value: number | null;
  suffix: string;
  empty?: string;
}) {
  return (
    <div className="border-border rounded-[var(--radius-control)] border p-4">
      <p className="text-label text-fg-muted">{label}</p>
      <p className="text-title-page text-fg-primary mt-2 font-semibold">
        {value === null ? "—" : `${value}${suffix}`}
      </p>
      {value === null ? (
        <p className="text-label text-fg-secondary mt-1">{empty}</p>
      ) : (
        <div className="bg-surface-subtle mt-3 h-2 overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full"
            style={{ width: `${Math.min(100, value)}%` }}
          />
        </div>
      )}
    </div>
  );
}
