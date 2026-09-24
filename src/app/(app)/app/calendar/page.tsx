import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, CheckSquare2, FileText } from "lucide-react";
import { toZonedTime } from "date-fns-tz";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import {
  getAgencyCalendarView,
  getAgencyTimezone,
  type AgencyCalendarEvent,
} from "@/lib/planning/calendar";
import { workspaceMonthRange } from "@/lib/i18n/workspace-month";
import { formatDate } from "@/lib/i18n/format-locale";
import { tForActive } from "@/lib/i18n/t-for-active";
import type { LocaleCode } from "@/lib/i18n/locales";
import { PageHeader } from "@/components/workspace/page-header";
import { MonthNav } from "@/components/workspace/month-nav";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { listAgencyMembers, listAgencyWorkspaces } from "@/lib/tasks/service";
import { cn } from "@/lib/utils";
import { z } from "zod";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await tForActive();
  return { title: t("calendar.globalTitle") };
}

function weekdays(code: LocaleCode) {
  return Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(code, { weekday: "short" }).format(new Date(2024, 0, 7 + index)),
  );
}

function eventLabel(
  event: AgencyCalendarEvent,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  return event.kind === "task"
    ? t(`tasks.status.${event.status}`)
    : t(`planningFilters.statusLabels.${event.status}`);
}

function EventCard({
  event,
  t,
}: {
  event: AgencyCalendarEvent;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <Link
      href={event.href}
      className="border-border bg-surface hover:border-primary/50 focus-visible:ring-focus-ring block rounded-[var(--radius-control)] border p-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <span className="text-label text-fg-muted inline-flex items-center gap-1 font-semibold">
        {event.kind === "task" ? (
          <CheckSquare2 className="h-3 w-3" aria-hidden="true" />
        ) : (
          <FileText className="h-3 w-3" aria-hidden="true" />
        )}
        {event.kind === "task" ? t("calendar.globalTask") : t("calendar.globalPlan")}
      </span>
      <span className="text-label text-fg-primary mt-1 block font-semibold wrap-break-word">
        {event.title}
      </span>
      <span className="text-label text-fg-muted mt-1 block truncate">
        {event.workspaceName ?? t("calendar.globalNoWorkspace")}
      </span>
      <span className="text-label text-fg-secondary mt-1 block">{eventLabel(event, t)}</span>
    </Link>
  );
}

export default async function GlobalCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; workspaceId?: string; assigneeId?: string }>;
}) {
  const { t, code } = await tForActive();
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  const context = await resolveActiveAgencyContext({ actor });
  if (!context) redirect("/setup");
  const requestedParams = await searchParams;
  const requested = requestedParams.month;
  const valid = requested?.match(/^(\d{4})-(\d{2})$/);
  const workspaceId = z.string().uuid().safeParse(requestedParams.workspaceId).success
    ? requestedParams.workspaceId
    : undefined;
  const assigneeId = z.string().uuid().safeParse(requestedParams.assigneeId).success
    ? requestedParams.assigneeId
    : undefined;
  const [agencyTimezone, members, workspaces] = await Promise.all([
    getAgencyTimezone(actor, context.agencyId),
    listAgencyMembers(context.agencyId),
    listAgencyWorkspaces(context.agencyId),
  ]);
  const now = new Date();
  const zonedNow = toZonedTime(now, agencyTimezone);
  const year = valid ? Number(valid[1]) : zonedNow.getFullYear();
  const month = valid ? Number(valid[2]) - 1 : zonedNow.getMonth();
  const reference = new Date(year, month, 1);
  const monthRange = workspaceMonthRange(year, month, agencyTimezone);
  const calendar = await getAgencyCalendarView(
    actor,
    context.agencyId,
    monthRange.start,
    monthRange.end,
    { workspaceId, assigneeId },
  );
  const firstWeekday = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Array.from(
    { length: Math.ceil((firstWeekday + days) / 7) * 7 },
    (_, index) => index - firstWeekday + 1,
  );
  const selectedMonth = `${year}-${String(month + 1).padStart(2, "0")}`;
  const queryFor = (monthValue: string) => {
    const params = new URLSearchParams({ month: monthValue });
    if (workspaceId) params.set("workspaceId", workspaceId);
    if (assigneeId) params.set("assigneeId", assigneeId);
    return `?${params.toString()}`;
  };
  const monthHref = (offset: number) => {
    const date = new Date(year, month + offset, 1);
    return queryFor(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  };
  const todayYear = zonedNow.getFullYear();
  const todayMonth = zonedNow.getMonth();
  const todayDay = zonedNow.getDate();
  const todayMonthValue = `${todayYear}-${String(todayMonth + 1).padStart(2, "0")}`;
  const hasFilters = Boolean(workspaceId || assigneeId);
  const eventDateIsToday = (date: Date) => {
    const zonedDate = toZonedTime(date, agencyTimezone);
    return (
      zonedDate.getFullYear() === todayYear &&
      zonedDate.getMonth() === todayMonth &&
      zonedDate.getDate() === todayDay
    );
  };
  const dayEvents = (day: number) =>
    calendar.events.filter((event) => {
      const date = toZonedTime(event.startsAt, agencyTimezone);
      return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day;
    });
  return (
    <div className="space-y-6" data-testid="global-calendar">
      <PageHeader
        title={t("calendar.globalTitle")}
        description={
          <>
            {t("calendar.globalDescription")}
            <span className="text-label text-fg-muted border-border bg-surface-subtle ms-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <CalendarDays className="h-3 w-3" aria-hidden="true" />
              {calendar.agencyTimezone}
            </span>
          </>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={queryFor(todayMonthValue)}
              {...(selectedMonth === todayMonthValue ? { "aria-current": "date" as const } : {})}
              className={cn(
                "border-border text-body focus-visible:ring-focus-ring inline-flex min-h-10 items-center rounded-[var(--radius-control)] border px-3 font-semibold focus-visible:ring-2 focus-visible:outline-none",
                selectedMonth === todayMonthValue
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-surface text-fg-primary hover:bg-surface-subtle",
              )}
            >
              {t("calendar.globalToday")}
            </Link>
            <MonthNav month={reference} buildHref={monthHref} locale={code as LocaleCode} t={t} />
          </div>
        }
      />
      <section
        className="border-border bg-surface rounded-[var(--radius-card)] border p-4"
        aria-labelledby="global-calendar-filters"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              id="global-calendar-filters"
              className="text-title-section text-fg-primary font-semibold"
            >
              {t("calendar.globalFilters")}
            </h2>
            <p className="text-body text-fg-secondary mt-1">{t("calendar.globalAssigneeNote")}</p>
          </div>
          {hasFilters ? (
            <Link
              href={queryFor(selectedMonth)}
              className="text-body text-primary font-semibold underline-offset-4 hover:underline"
            >
              {t("calendar.globalClearFilters")}
            </Link>
          ) : null}
        </div>
        <form
          method="get"
          className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end"
        >
          <input type="hidden" name="month" value={selectedMonth} />
          <FormField id="calendar-workspace" label={t("calendar.globalWorkspaceFilter")}>
            <select
              id="calendar-workspace"
              name="workspaceId"
              defaultValue={workspaceId ?? ""}
              className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring mt-1 block min-h-11 w-full rounded-[var(--radius-control)] border px-3 font-normal focus-visible:ring-2"
            >
              <option value="">{t("calendar.globalAnyWorkspace")}</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="calendar-assignee" label={t("calendar.globalAssigneeFilter")}>
            <select
              id="calendar-assignee"
              name="assigneeId"
              defaultValue={assigneeId ?? ""}
              className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring mt-1 block min-h-11 w-full rounded-[var(--radius-control)] border px-3 font-normal focus-visible:ring-2"
            >
              <option value="">{t("calendar.globalAnyAssignee")}</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </FormField>
          <Button type="submit" variant="secondary" className="min-h-11">
            {t("calendar.globalApplyFilters")}
          </Button>
        </form>
      </section>
      <p className="text-label text-fg-muted" aria-live="polite">
        {t("calendar.globalShowing", { count: calendar.events.length })}
      </p>
      <section className="space-y-2 md:hidden" aria-label={t("calendar.globalAgendaAriaLabel")}>
        {calendar.events.length === 0 ? (
          <div className="border-border bg-surface text-body text-fg-secondary rounded-[var(--radius-card)] border p-4">
            {t("calendar.globalEmptyMonth")}
          </div>
        ) : (
          calendar.events.map((event) => (
            <div
              key={`${event.kind}-${event.id}`}
              className="border-border bg-surface grid grid-cols-[5rem_minmax(0,1fr)] gap-3 rounded-[var(--radius-card)] border p-3"
            >
              <time className="text-label text-fg-secondary font-semibold">
                {eventDateIsToday(event.startsAt) ? `${t("calendar.globalToday")} · ` : ""}
                {formatDate(event.startsAt, code, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  timeZone: agencyTimezone,
                })}
              </time>
              <EventCard event={event} t={t} />
            </div>
          ))
        )}
      </section>
      <div className="border-border bg-surface hidden overflow-x-auto rounded-[var(--radius-card)] border md:block">
        <div className="grid min-w-[900px] grid-cols-7">
          {weekdays(code as LocaleCode).map((day) => (
            <div
              key={day}
              className="border-border text-label text-fg-muted border-b p-3 font-semibold"
            >
              {day}
            </div>
          ))}
          {cells.map((day, index) => {
            const inMonth = day >= 1 && day <= days;
            const events = inMonth ? dayEvents(day) : [];
            return (
              <div
                key={index}
                className={cn(
                  "border-border min-h-36 border-e border-b p-2",
                  !inMonth && "bg-surface-subtle/40",
                  inMonth &&
                    year === todayYear &&
                    month === todayMonth &&
                    day === todayDay &&
                    "bg-primary/5 ring-primary/30 ring-1 ring-inset",
                )}
              >
                <span
                  {...(inMonth && year === todayYear && month === todayMonth && day === todayDay
                    ? { "aria-current": "date" as const }
                    : {})}
                  className={cn(
                    "text-label",
                    inMonth ? "text-fg-muted" : "invisible",
                    inMonth &&
                      year === todayYear &&
                      month === todayMonth &&
                      day === todayDay &&
                      "text-primary font-bold",
                  )}
                >
                  {day}
                </span>
                <div className="mt-2 space-y-1">
                  {events.slice(0, 5).map((event) => (
                    <EventCard key={`${event.kind}-${event.id}`} event={event} t={t} />
                  ))}
                  {events.length > 5 ? (
                    <p className="text-label text-fg-muted px-1">+{events.length - 5}</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
