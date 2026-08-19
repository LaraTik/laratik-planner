import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { listWorkspaceContent } from "@/lib/content/service";
import { ALL_STATUSES, humanFormat } from "@/lib/content/status";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { ChevronLeft, ChevronRight, Files, Plus, FileText } from "lucide-react";
import { StatusBadge } from "@/components/content/status-badge";
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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-label text-fg-muted">{ws.name}</p>
          <h1 className="text-title-page text-fg-primary font-semibold">Planning</h1>
          <p className="text-body text-fg-secondary mt-1">
            {now.toLocaleString("default", { month: "long", year: "numeric" })} · {items.length}{" "}
            item
            {items.length === 1 ? "" : "s"}
          </p>
        </div>
        {canCreate ? (
          <div className="flex flex-wrap items-center gap-2">
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
          </div>
        ) : null}
      </header>

      <div className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border p-3">
        <div className="flex items-center gap-2">
          <Link
            aria-label="Previous month"
            href={`?month=${monthParam(-1)}`}
            className="border-border rounded-[var(--radius-control)] border p-2"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="text-body min-w-36 text-center font-semibold">
            {now.toLocaleString("default", { month: "long", year: "numeric" })}
          </span>
          <Link
            aria-label="Next month"
            href={`?month=${monthParam(1)}`}
            className="border-border rounded-[var(--radius-control)] border p-2"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
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
            defaultValue={filters.density ?? "comfortable"}
            className="border-border bg-surface text-body h-10 rounded-[var(--radius-control)] border px-3"
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
          <Button variant="outline" type="submit">
            Apply
          </Button>
          {selectedStatus || filters.risk ? (
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
        <ul className="border-border bg-surface divide-border divide-y overflow-hidden rounded-[var(--radius-card)] border">
          {items.map((it) => (
            <li
              key={it.id}
              className="hover:bg-surface-subtle focus-within:bg-surface-subtle transition"
            >
              <Link
                href={`/app/w/${slug}/planning/${it.id}`}
                className={`flex items-center gap-3 px-4 ${filters.density === "compact" ? "py-2" : "py-3"} sm:gap-4`}
              >
                <FileText
                  className="text-fg-muted hidden h-4 w-4 shrink-0 sm:block"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <span className="text-body text-fg-primary block truncate font-semibold">
                    {it.title}
                  </span>
                  <p className="text-label text-fg-muted">
                    {humanFormat(it.format)} · {it.plannedPublishAt.toLocaleDateString()}
                  </p>
                </div>
                <StatusBadge status={it.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
