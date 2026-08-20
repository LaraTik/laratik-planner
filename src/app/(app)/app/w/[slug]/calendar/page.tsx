import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Clock } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { listWorkspaceContent } from "@/lib/content/service";
import { statusBadgeVariant } from "@/lib/content/status";
import { Badge } from "@/components/ui/badge";
import { humanize } from "@/lib/content/status";
import { PageHeader } from "@/components/workspace/page-header";
import { MonthNav } from "@/components/workspace/month-nav";
import { PlanningViewToggle } from "@/components/workspace/planning-view-toggle";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export default async function EditorialCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const requested = (await searchParams).month;
  const valid = requested?.match(/^(\d{4})-(\d{2})$/);
  const reference = valid ? new Date(Number(valid[1]), Number(valid[2]) - 1, 1) : new Date();
  const monthStart = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const monthEnd = new Date(reference.getFullYear(), reference.getMonth() + 1, 1);
  const items = await listWorkspaceContent({ id: session.user.id }, workspace.id, {
    monthStart,
    monthEnd,
  });
  const firstWeekday = monthStart.getDay();
  const days = new Date(reference.getFullYear(), reference.getMonth() + 1, 0).getDate();
  const cells = Array.from(
    { length: Math.ceil((firstWeekday + days) / 7) * 7 },
    (_, index) => index - firstWeekday + 1,
  );
  const monthParam = (offset: number) => {
    const d = new Date(reference.getFullYear(), reference.getMonth() + offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const today = new Date();
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={workspace.name}
        title="Editorial calendar"
        description={
          <>
            Planned publish dates in the workspace timezone.
            <span className="text-label text-fg-muted border-border bg-surface-subtle ml-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {workspace.timezone}
            </span>
          </>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <PlanningViewToggle workspaceSlug={slug} />
            <MonthNav month={reference} buildHref={(offset) => `?month=${monthParam(offset)}`} />
          </div>
        }
      />

      <div className="border-border bg-surface overflow-x-auto rounded-[var(--radius-card)] border">
        <div className="grid min-w-[760px] grid-cols-7">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="border-border text-label text-fg-muted border-b p-3 font-semibold"
            >
              {day}
            </div>
          ))}
          {cells.map((day, index) => {
            const cellDate = new Date(reference.getFullYear(), reference.getMonth(), day);
            const inMonth = day >= 1 && day <= days;
            const isToday = inMonth && isSameDay(cellDate, today);
            const cellItems = inMonth
              ? items.filter((item) => item.plannedPublishAt.getDate() === day)
              : [];
            return (
              <div
                key={index}
                className={cn(
                  "border-border min-h-32 border-r border-b p-2",
                  !inMonth && "bg-surface-subtle/40",
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "text-label",
                      !inMonth ? "invisible" : isToday ? "text-fg-primary" : "text-fg-muted",
                    )}
                  >
                    {day}
                  </span>
                  {isToday ? (
                    <span className="text-label bg-primary text-on-primary rounded-full px-1.5 font-semibold">
                      Today
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 space-y-1">
                  {cellItems.map((item) => {
                    const variant = statusBadgeVariant(item.status);
                    return (
                      <Link
                        key={item.id}
                        href={`/app/w/${slug}/planning/${item.id}`}
                        data-testid={`calendar-event-${item.id}`}
                        className={cn(
                          "hover:border-primary block rounded border p-2 transition-colors",
                          // Per status: a left border in the badge color so
                          // the day cell shows the status at a glance
                          // without competing with the badge inside.
                          variant === "success" && "border-l-success border-l-4",
                          variant === "warning" && "border-l-warning border-l-4",
                          variant === "danger" && "border-l-danger border-l-4",
                          variant === "info" && "border-l-info border-l-4",
                          variant === "primary" && "border-l-primary border-l-4",
                          variant === "default" && "border-l-border border-l-4",
                        )}
                      >
                        <p className="text-label text-fg-primary truncate font-semibold">
                          {item.title}
                        </p>
                        <div className="mt-1 flex items-center gap-1.5">
                          <Badge variant={variant} className="text-[10px]">
                            {humanize(item.status)}
                          </Badge>
                          <span className="text-label text-fg-muted truncate">
                            {humanize(item.format)}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
