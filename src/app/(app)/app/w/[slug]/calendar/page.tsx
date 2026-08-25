import { redirect, notFound } from "next/navigation";
import { Clock } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { listWorkspaceContent } from "@/lib/content/service";
import { PageHeader } from "@/components/workspace/page-header";
import { MonthNav } from "@/components/workspace/month-nav";
import { CalendarEventCard } from "@/components/workspace/calendar-event-card";
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
    <div className="space-y-6" data-testid="workspace-calendar">
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
          <MonthNav month={reference} buildHref={(offset) => `?month=${monthParam(offset)}`} />
        }
      />

      <section className="space-y-2 md:hidden" aria-label="Calendar agenda">
        {items.length === 0 ? (
          <div className="border-border bg-surface text-body text-fg-secondary rounded-[var(--radius-card)] border p-4">
            Nothing is scheduled for this month.
          </div>
        ) : (
          items.map((item) => {
            const isTodayItem = isSameDay(item.plannedPublishAt, today);
            return (
              <div
                key={item.id}
                className="border-border bg-surface grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 rounded-[var(--radius-card)] border p-3"
              >
                <time
                  dateTime={item.plannedPublishAt.toISOString()}
                  {...(isTodayItem ? { "aria-current": "date" as const } : {})}
                  className="text-label text-fg-secondary font-semibold"
                >
                  {item.plannedPublishAt.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </time>
                <CalendarEventCard
                  id={item.id}
                  href={`/app/w/${slug}/planning/${item.id}`}
                  title={item.title}
                  status={item.status}
                  format={item.format}
                />
              </div>
            );
          })
        )}
      </section>

      <div className="border-border bg-surface hidden overflow-x-auto rounded-[var(--radius-card)] border md:block">
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
                  {inMonth ? (
                    <time
                      dateTime={cellDate.toISOString().slice(0, 10)}
                      {...(isToday ? { "aria-current": "date" as const } : {})}
                      className={cn(
                        "text-label",
                        isToday ? "text-fg-primary font-semibold" : "text-fg-muted",
                      )}
                    >
                      {day}
                    </time>
                  ) : (
                    <span className="text-label invisible">{day}</span>
                  )}
                  {isToday ? (
                    // `text-white` (not `text-on-primary`) because the
                    // project doesn't define an `on-primary` token and
                    // the inherited `text-fg-primary` (#172033) on the
                    // indigo `bg-primary` (#4f46e5) only reaches 2.58:1
                    // — fails WCAG AA. White-on-indigo is 5.85:1.
                    <span
                      aria-label={`Today, ${cellDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`}
                      className="text-label bg-primary rounded-full px-1.5 font-semibold text-white"
                    >
                      Today
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 space-y-1">
                  {cellItems.map((item) => (
                    <CalendarEventCard
                      key={item.id}
                      id={item.id}
                      href={`/app/w/${slug}/planning/${item.id}`}
                      title={item.title}
                      status={item.status}
                      format={item.format}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
