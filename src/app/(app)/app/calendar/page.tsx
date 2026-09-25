import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, CheckSquare2, FileText, ListTodo } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  listAgencyMembers,
  listAgencyWorkspaces,
  TASK_STATUSES,
  type TaskStatus,
} from "@/lib/tasks/service";
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
      {event.kind === "task" && event.assigneeName ? (
        <span className="text-label text-fg-muted mt-1 block truncate">{event.assigneeName}</span>
      ) : null}
    </Link>
  );
}

export default async function GlobalCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    workspaceId?: string;
    assigneeId?: string;
    taskStatus?: string;
    // The hidden-input + checkbox pair below sends the same name
    // twice when the box is checked, so Next.js delivers these as
    // `string[]`. We use `[].concat(value)` to normalise both
    // single-value and array shapes before reading.
    showPlans?: string | string[];
    showTasks?: string | string[];
  }>;
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
  const taskStatus = TASK_STATUSES.includes(requestedParams.taskStatus as TaskStatus)
    ? (requestedParams.taskStatus as TaskStatus)
    : undefined;
  // The showPlans / showTasks checkboxes are paired with a hidden
  // `<input value="false">` so the form always carries an explicit
  // value. We read the array (Next.js searchParams can be
  // `string | string[]`) and resolve with "true wins" — a checked
  // checkbox submits `["false", "true"]`, an unchecked one submits
  // `["false"]`. The "first wins" fallback that was here before
  // (and the implicit default-true when the param was absent) made
  // unchecking the box a silent no-op.
  const showPlansValues = requestedParams.showPlans
    ? ([] as string[]).concat(requestedParams.showPlans)
    : [];
  const showTasksValues = requestedParams.showTasks
    ? ([] as string[]).concat(requestedParams.showTasks)
    : [];
  const showPlans = showPlansValues.includes("true");
  const showTasks = showTasksValues.includes("true");
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
    { workspaceId, assigneeId, taskStatus, showPlans, showTasks },
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
    if (taskStatus) params.set("taskStatus", taskStatus);
    if (!showPlans) params.set("showPlans", "false");
    if (!showTasks) params.set("showTasks", "false");
    return `?${params.toString()}`;
  };
  // Bare URL with no filter params — the "Clear filters" link
  // must NOT round-trip the active filters or the action is a
  // no-op. The round-4 audit found `Clear filters` was wired to
  // `queryFor(selectedMonth)`, which kept every active filter in
  // the URL (workspaceId / assigneeId / taskStatus / showPlans /
  // showTasks), making the link functionally a refresh.
  const monthOnlyHref = `?month=${selectedMonth}`;
  const monthHref = (offset: number) => {
    const date = new Date(year, month + offset, 1);
    return queryFor(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  };
  const todayYear = zonedNow.getFullYear();
  const todayMonth = zonedNow.getMonth();
  const todayDay = zonedNow.getDate();
  const todayMonthValue = `${todayYear}-${String(todayMonth + 1).padStart(2, "0")}`;
  const hasFilters = Boolean(workspaceId || assigneeId || taskStatus || !showPlans || !showTasks);
  const taskViewParams = new URLSearchParams();
  if (workspaceId) taskViewParams.set("workspaceId", workspaceId);
  if (assigneeId) taskViewParams.set("assigneeId", assigneeId);
  if (taskStatus) taskViewParams.set("status", taskStatus);
  const tasksHref = `/app/tasks${taskViewParams.toString() ? `?${taskViewParams.toString()}` : ""}`;
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
              href={monthOnlyHref}
              className="text-body text-primary font-semibold underline-offset-4 hover:underline"
            >
              {t("calendar.globalClearFilters")}
            </Link>
          ) : null}
        </div>
        <form
          method="get"
          className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_auto] lg:items-end"
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
          <FormField id="calendar-task-status" label={t("calendar.globalTaskStatusFilter")}>
            <select
              id="calendar-task-status"
              name="taskStatus"
              defaultValue={taskStatus ?? ""}
              className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring mt-1 block min-h-11 w-full rounded-[var(--radius-control)] border px-3 font-normal focus-visible:ring-2"
            >
              <option value="">{t("calendar.globalAnyTaskStatus")}</option>
              {TASK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`tasks.status.${status}`)}
                </option>
              ))}
            </select>
          </FormField>
          <fieldset className="border-border flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-control)] border px-3 py-2 sm:col-span-2 lg:col-span-3">
            <legend className="text-label text-fg-muted px-1">{t("calendar.globalShow")}</legend>
            {/* Hidden inputs guarantee the boolean ALWAYS submits
                regardless of checkbox state. Without them, an
                unchecked checkbox is omitted from the form payload
                and the server falls back to its default (true), so
                unchecking "Show plans" / "Show tasks" was a silent
                no-op. The pair (`hidden=false` + `checkbox=true`)
                resolves to `getAll("...").includes("true")` on the
                server when the checkbox is checked, and `["false"]`
                when it is not. */}
            <label
              htmlFor="calendar-show-plans"
              className="text-body text-fg-primary inline-flex min-h-8 cursor-pointer items-center gap-2"
            >
              <input type="hidden" name="showPlans" value="false" />
              <Checkbox
                id="calendar-show-plans"
                name="showPlans"
                value="true"
                defaultChecked={showPlans}
              />
              {t("calendar.globalPlans")}
            </label>
            <label
              htmlFor="calendar-show-tasks"
              className="text-body text-fg-primary inline-flex min-h-8 cursor-pointer items-center gap-2"
            >
              <input type="hidden" name="showTasks" value="false" />
              <Checkbox
                id="calendar-show-tasks"
                name="showTasks"
                value="true"
                defaultChecked={showTasks}
              />
              {t("calendar.globalTasks")}
            </label>
          </fieldset>
          <Button type="submit" variant="secondary" className="min-h-11">
            {t("calendar.globalApplyFilters")}
          </Button>
        </form>
      </section>
      {hasFilters ? (
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label={t("calendar.globalActiveFilters")}
        >
          <span className="text-label text-fg-muted">{t("calendar.globalActiveFilters")}:</span>
          {workspaceId ? (
            <span className="bg-primary-subtle text-primary text-label rounded-full px-2.5 py-1 font-semibold">
              {workspaces.find((workspace) => workspace.id === workspaceId)?.name ??
                t("calendar.globalWorkspaceFilter")}
            </span>
          ) : null}
          {assigneeId ? (
            <span className="bg-primary-subtle text-primary text-label rounded-full px-2.5 py-1 font-semibold">
              {members.find((member) => member.id === assigneeId)?.name ??
                t("calendar.globalAssigneeFilter")}
            </span>
          ) : null}
          {taskStatus ? (
            <span className="bg-primary-subtle text-primary text-label rounded-full px-2.5 py-1 font-semibold">
              {t(`tasks.status.${taskStatus}`)}
            </span>
          ) : null}
          {!showPlans ? (
            <span className="bg-surface-subtle text-fg-secondary text-label rounded-full px-2.5 py-1 font-semibold">
              {t("calendar.globalTasksOnly")}
            </span>
          ) : null}
          {!showTasks ? (
            <span className="bg-surface-subtle text-fg-secondary text-label rounded-full px-2.5 py-1 font-semibold">
              {t("calendar.globalPlansOnly")}
            </span>
          ) : null}
        </div>
      ) : null}
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
      {showTasks && calendar.unscheduledTasks.length > 0 ? (
        <section
          className="border-border bg-surface rounded-[var(--radius-card)] border p-4"
          aria-labelledby="global-calendar-unscheduled"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2
                id="global-calendar-unscheduled"
                className="text-title-section text-fg-primary font-semibold"
              >
                <span className="inline-flex items-center gap-2">
                  <ListTodo className="h-4 w-4" aria-hidden="true" />
                  {t("calendar.globalUnscheduledTitle")}
                </span>
              </h2>
              <p className="text-body text-fg-secondary mt-1">
                {t("calendar.globalUnscheduledDescription")}
              </p>
            </div>
            <Link
              href={tasksHref}
              className="text-body text-primary focus-visible:ring-focus-ring inline-flex min-h-10 items-center font-semibold underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >
              {t("calendar.globalViewAllTasks")}
            </Link>
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {calendar.unscheduledTasks.map((task) => (
              <li key={task.id}>
                <Link
                  href={task.href}
                  className="border-border bg-surface-subtle hover:border-primary/50 focus-visible:ring-focus-ring block min-h-20 rounded-[var(--radius-control)] border p-3 focus-visible:ring-2 focus-visible:outline-none"
                >
                  <span className="text-body text-fg-primary block font-semibold wrap-break-word">
                    {task.title}
                  </span>
                  <span className="text-label text-fg-muted mt-1 block truncate">
                    {task.workspaceName ?? t("calendar.globalNoWorkspace")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
