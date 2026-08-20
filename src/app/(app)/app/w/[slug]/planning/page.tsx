import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { listWorkspaceContent } from "@/lib/content/service";
import { ALL_STATUSES, humanFormat } from "@/lib/content/status";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { Files, Plus, FileText } from "lucide-react";
import { StatusBadge } from "@/components/content/status-badge";
import { PageHeader } from "@/components/workspace/page-header";
import { ListCard, ListItem } from "@/components/workspace/list-item";
import { MonthNav } from "@/components/workspace/month-nav";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";

/**
 * Planning list (Goal 6 master prompt §3 Monthly Planning List).
 *
 * Shows the current month's content for the workspace, ordered by
 * planned publish date. Defaults to "all" status; status filter is a
 * later enhancement.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return { title: `Planning · ${(await params).slug}` };
}

export default async function PlanningPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ month?: string; status?: string; risk?: string; density?: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const ws = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!ws) notFound();
  const canCreate = await hasWorkspaceRole({ id: session.user.id }, ws.id, [
    "workspace_manager",
    "content_planner",
  ]);

  const filters = await searchParams;
  const match = filters.month?.match(/^(\d{4})-(\d{2})$/);
  const now = match ? new Date(Number(match[1]), Number(match[2]) - 1, 1) : new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const selectedStatus =
    filters.status && (ALL_STATUSES as readonly string[]).includes(filters.status)
      ? filters.status
      : undefined;
  const density = filters.density === "compact" ? "compact" : "comfortable";
  let items = await listWorkspaceContent({ id: session.user.id }, ws.id, {
    monthStart,
    monthEnd,
    ...(selectedStatus ? { status: selectedStatus } : {}),
  });
  if (filters.risk === "at_risk")
    items = items.filter(
      (item) =>
        item.plannedPublishAt < new Date() &&
        !["ready_to_publish", "partially_published", "published", "cancelled"].includes(
          item.status,
        ),
    );
  const monthParam = (offset: number) => {
    const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  };
  const buildMonthHref = (offset: number) => `?month=${monthParam(offset)}`;
  const hasFilter = Boolean(selectedStatus || filters.risk);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={ws.name}
        title="Planning"
        description={
          <>
            {now.toLocaleString("default", { month: "long", year: "numeric" })} · {items.length}{" "}
            item{items.length === 1 ? "" : "s"}
          </>
        }
        action={
          canCreate ? (
            <>
              <Button variant="outline" asChild>
                <Link href={`/app/w/${slug}/planning/batch`}>
                  <Files className="h-4 w-4" />
                  Batch add
                </Link>
              </Button>
              <Button asChild>
                <Link href={`/app/w/${slug}/planning/new`}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Quick Create
                </Link>
              </Button>
            </>
          ) : null
        }
      />

      <div className="border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-card)] border p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <MonthNav month={now} buildHref={buildMonthHref} />
        <form className="flex flex-wrap items-center gap-2">
          <input
            type="hidden"
            name="month"
            value={`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`}
          />
          <select
            name="status"
            aria-label="Filter by status"
            defaultValue={selectedStatus ?? ""}
            className="border-border bg-surface text-body h-10 rounded-[var(--radius-control)] border px-3"
          >
            <option value="">All statuses</option>
            {ALL_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <select
            name="density"
            aria-label="List density"
            defaultValue={density}
            className="border-border bg-surface text-body h-10 rounded-[var(--radius-control)] border px-3"
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
          <Button variant="outline" type="submit">
            Apply
          </Button>
          {hasFilter ? (
            <Button variant="ghost" asChild>
              <Link
                href={`/app/w/${slug}/planning?month=${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`}
              >
                Clear
              </Link>
            </Button>
          ) : null}
        </form>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" aria-hidden="true" />}
          title="Nothing planned for this month"
          description="Use Quick Create to add a draft — it'll show up here ready to schedule."
          action={
            canCreate ? (
              <Button asChild>
                <Link href={`/app/w/${slug}/planning/new`}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Quick Create
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ListCard>
          {items.map((it) => (
            <ListItem
              key={it.id}
              href={`/app/w/${slug}/planning/${it.id}`}
              leading={<FileText className="text-fg-muted h-4 w-4" aria-hidden="true" />}
              title={it.title}
              meta={`${humanFormat(it.format)} · ${it.plannedPublishAt.toLocaleDateString()}`}
              trailing={<StatusBadge status={it.status} />}
              density={density}
            />
          ))}
        </ListCard>
      )}
    </div>
  );
}
