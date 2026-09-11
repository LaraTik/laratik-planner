import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { Clock } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { listWorkspaceContent } from "@/lib/content/service";
import { PageHeader } from "@/components/workspace/page-header";
import { MonthNav } from "@/components/workspace/month-nav";
import { CalendarEventCard } from "@/components/workspace/calendar-event-card";
import { cn } from "@/lib/utils";
import { workspaceMonthRange } from "@/lib/i18n/workspace-month";
import { tForActive } from "@/lib/i18n/t-for-active";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await tForActive();
  return { title: t("sidebar.planningCalendar") };
}
import type { LocaleCode } from "@/lib/i18n/locales";

/**
 * Build the locale-aware weekday headers for the calendar
 * grid. `Intl.DateTimeFormat` with `weekday: "short"` returns
 * the abbreviated day name in the active locale. We anchor
 * the array to Sunday so the grid layout (Sun → Sat) is
 * stable across locales; the *labels* are the ones that
 * change between English and Arabic.
 */
function buildWeekdays(code: LocaleCode): readonly string[] {
  const fmt = new Intl.DateTimeFormat(code, { weekday: "short" });
  // Index 0 = Sunday through index 6 = Saturday.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 7 + i)));
}

export default async function EditorialCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { t, code, dir } = await tForActive();
  const weekdays = buildWeekdays(code as LocaleCode);
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const requested = (await searchParams).month;
  const valid = requested?.match(/^(\d{4})-(\d{2})$/);
  const zonedNow = toZonedTime(new Date(), workspace.timezone);
  const calendarYear = valid ? Number(valid[1]) : zonedNow.getFullYear();
  const calendarMonth = valid ? Number(valid[2]) - 1 : zonedNow.getMonth();
  const reference = new Date(calendarYear, calendarMonth, 1);
  const { start: monthStart, end: monthEnd } = workspaceMonthRange(
    calendarYear,
    calendarMonth,
    workspace.timezone,
  );
  const items = await listWorkspaceContent({ id: session.user.id }, workspace.id, {
    monthStart,
    monthEnd,
  });
  const firstWeekday = new Date(calendarYear, calendarMonth, 1).getDay();
  const days = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const cells = Array.from(
    { length: Math.ceil((firstWeekday + days) / 7) * 7 },
    (_, index) => index - firstWeekday + 1,
  );
  const monthParam = (offset: number) => {
    const d = new Date(calendarYear, calendarMonth + offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const today = toZonedTime(new Date(), workspace.timezone);
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  // Locale-aware date / weekday formatters. The mobile
  // agenda uses the abbreviated day + month form; the
  // grid's "Today" badge uses the long weekday + month
  // + day form. Both follow the active `dir` so Arabic
  // dates render Arabic script + Western `0–9` digits.
  const bcp47 = dir === "rtl" ? "ar" : "en";
  const agendaDateFmt = new Intl.DateTimeFormat(bcp47, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: workspace.timezone,
  });
  const todayLongFmt = new Intl.DateTimeFormat(bcp47, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: workspace.timezone,
  });

  return (
    <div className="space-y-6" data-testid="workspace-calendar">
      <PageHeader
        eyebrow={workspace.name}
        title={t("calendar.title")}
        description={
          <>
            {t("calendar.description")}
            <span className="text-label text-fg-muted border-border bg-surface-subtle ms-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {workspace.timezone}
            </span>
          </>
        }
        action={
          <MonthNav
            month={reference}
            buildHref={(offset) => `?month=${monthParam(offset)}`}
            locale={code as LocaleCode}
            t={t}
          />
        }
      />

      <section className="space-y-2 md:hidden" aria-label={t("calendar.agendaAriaLabel")}>
        {items.length === 0 ? (
          <div className="border-border bg-surface text-body text-fg-secondary rounded-[var(--radius-card)] border p-4">
            {t("calendar.emptyMonth")}
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
                  {agendaDateFmt.format(item.plannedPublishAt)}
                </time>
                <CalendarEventCard
                  id={item.id}
                  href={`/app/w/${slug}/planning/${item.id}`}
                  title={item.title}
                  status={item.status}
                  statusLabel={t(`planningFilters.statusLabels.${item.status}`)}
                  format={item.format}
                  formatLabel={t(`planningFilters.formatLabels.${item.format}`)}
                />
              </div>
            );
          })
        )}
      </section>

      <div className="border-border bg-surface hidden overflow-x-auto rounded-[var(--radius-card)] border md:block">
        <div className="grid min-w-[760px] grid-cols-7">
          {weekdays.map((day) => (
            <div
              key={day}
              className="border-border text-label text-fg-muted border-b p-3 font-semibold"
            >
              {day}
            </div>
          ))}
          {cells.map((day, index) => {
            const cellDate = new Date(calendarYear, calendarMonth, day);
            const inMonth = day >= 1 && day <= days;
            const isToday = inMonth && isSameDay(cellDate, today);
            const cellItems = inMonth
              ? items.filter((item) => {
                  const itemDate = toZonedTime(item.plannedPublishAt, workspace.timezone);
                  return (
                    itemDate.getFullYear() === calendarYear &&
                    itemDate.getMonth() === calendarMonth &&
                    itemDate.getDate() === day
                  );
                })
              : [];
            return (
              <div
                key={index}
                className={cn(
                  "border-border min-h-32 border-e border-b p-2",
                  !inMonth && "bg-surface-subtle/40",
                )}
              >
                <div className="flex items-center justify-between">
                  {inMonth ? (
                    <time
                      dateTime={`${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`}
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
                      aria-label={t("calendar.todayAriaLabel", {
                        date: todayLongFmt.format(
                          fromZonedTime(
                            new Date(calendarYear, calendarMonth, day, 12),
                            workspace.timezone,
                          ),
                        ),
                      })}
                      className="text-label bg-primary rounded-full px-1.5 font-semibold text-white"
                    >
                      {t("calendar.today")}
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
                      statusLabel={t(`planningFilters.statusLabels.${item.status}`)}
                      format={item.format}
                      formatLabel={t(`planningFilters.formatLabels.${item.format}`)}
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
