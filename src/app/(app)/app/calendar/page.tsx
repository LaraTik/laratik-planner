import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, ListTodo } from "lucide-react";
import { toZonedTime } from "date-fns-tz";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import {
  getAgencyCalendarView,
  getAgencyTimezone,
  getUserWorkload,
  type AgencyCalendarEvent,
  type UserWorkload,
  type WorkloadPlan,
  type WorkloadTask,
} from "@/lib/planning/calendar";
import { workspaceMonthRange } from "@/lib/i18n/workspace-month";
import { formatDate } from "@/lib/i18n/format-locale";
import { tForActive } from "@/lib/i18n/t-for-active";
import type { LocaleCode } from "@/lib/i18n/locales";
import { PageHeader } from "@/components/workspace/page-header";
import { MonthNav } from "@/components/workspace/month-nav";
import { CalendarEventCard } from "@/components/workspace/calendar-event-card";
import { WorkspaceLegend } from "@/components/workspace/workspace-legend";
import {
  assignWorkspaceSeries,
  workspaceSeriesSlot,
  workspaceSeriesVar,
} from "@/lib/planning/workspace-color";
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

function eventStatusLabel(
  event: AgencyCalendarEvent,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  return event.kind === "task"
    ? t(`tasks.status.${event.status}`)
    : t(`planningFilters.statusLabels.${event.status}`);
}

function eventPriorityLabel(
  event: AgencyCalendarEvent,
  t: (key: string, params?: Record<string, string | number>) => string,
): string | null {
  if (event.kind !== "task") return null;
  const priority = event.priority;
  if (!priority) return null;
  return t(`tasks.priority.${priority}`);
}

/**
 * Calendar filter feedback (gap from round-of-2026-09-27):
 * The assignee + status filters only affect tasks. When the user
 * picks an assignee with no tasks this month, the calendar visually
 * looks identical to the unfiltered view (plans dominate the count)
 * — making the filter feel broken. This component:
 *   1. Always splits the count into plan/task breakdown so the user
 *      sees WHICH side of the calendar the filter is touching.
 *   2. When an assignee/status filter is active AND the resulting
 *      task list is empty, renders a prominent hint explaining why
 *      the calendar still shows plans. Without this hint, users
 *      report "I chose an assignee and the filter did nothing."
 */
function CalendarCountSummary({
  events,
  assigneeName,
  statusLabel,
  hasTaskFilter,
  t,
}: {
  events: AgencyCalendarEvent[];
  assigneeName: string | null;
  statusLabel: string | null;
  hasTaskFilter: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const planCount = events.reduce((acc, event) => acc + (event.kind === "plan" ? 1 : 0), 0);
  const taskCount = events.length - planCount;
  const noTasksForFilter = hasTaskFilter && taskCount === 0 && planCount > 0;
  return (
    <div className="space-y-1" aria-live="polite">
      <p className="text-label text-fg-muted">{renderBreakdownText({ planCount, taskCount, t })}</p>
      {noTasksForFilter ? (
        <p
          className="border-warning/40 bg-warning-subtle text-warning text-label rounded-[var(--radius-control)] border px-2.5 py-1 font-semibold"
          role="status"
        >
          {assigneeName
            ? t("calendar.globalNoTasksForAssignee", {
                assignee: assigneeName,
                plans: planCount,
              })
            : statusLabel
              ? t("calendar.globalNoTasksForStatus", {
                  status: statusLabel,
                  plans: planCount,
                })
              : null}
        </p>
      ) : null}
    </div>
  );
}

function renderBreakdownText({
  planCount,
  taskCount,
  t,
}: {
  planCount: number;
  taskCount: number;
  t: (key: string, params?: Record<string, string | number>) => string;
}): string {
  if (planCount === 0 && taskCount === 0) return t("calendar.globalShowing", { count: 0 });
  if (taskCount === 0) {
    return t("calendar.globalShowingBreakdownPlansOnly", { plans: planCount });
  }
  if (planCount === 0) {
    return t("calendar.globalShowingBreakdownTasksOnly", { tasks: taskCount });
  }
  return t("calendar.globalShowingBreakdown", { plans: planCount, tasks: taskCount });
}

/**
 * View toggle (round-of-2026-09-27, workload feature):
 * segmented control above the filters that swaps between the
 * agency-wide calendar grid and the per-user workload panel.
 * Pure URL navigation — no client JS — so the server stays the
 * single source of truth and the state survives reloads.
 */
function ViewToggle({
  view,
  calendarHref,
  workloadHref,
  t,
}: {
  view: "calendar" | "workload";
  calendarHref: string;
  workloadHref: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <div
      role="tablist"
      aria-label={t("calendar.viewToggleAriaLabel")}
      data-testid="calendar-view-toggle"
      className="border-border bg-surface-subtle inline-flex items-center gap-1 rounded-[var(--radius-control)] border p-1"
    >
      <Link
        role="tab"
        href={calendarHref}
        aria-selected={view === "calendar"}
        data-testid="calendar-view-tab"
        className={cn(
          "text-body focus-visible:ring-focus-ring inline-flex min-h-9 items-center rounded-[var(--radius-control)] px-3 font-semibold focus-visible:ring-2 focus-visible:outline-none",
          view === "calendar"
            ? "bg-surface text-fg-primary shadow-sm"
            : "text-fg-secondary hover:text-fg-primary",
        )}
      >
        {t("calendar.viewCalendar")}
      </Link>
      <Link
        role="tab"
        href={workloadHref}
        aria-selected={view === "workload"}
        data-testid="workload-view-tab"
        className={cn(
          "text-body focus-visible:ring-focus-ring inline-flex min-h-9 items-center rounded-[var(--radius-control)] px-3 font-semibold focus-visible:ring-2 focus-visible:outline-none",
          view === "workload"
            ? "bg-surface text-fg-primary shadow-sm"
            : "text-fg-secondary hover:text-fg-primary",
        )}
      >
        {t("calendar.viewWorkload")}
      </Link>
    </div>
  );
}

/**
 * Workload view (round-of-2026-09-27, user request):
 * Single-user panel that shows a person's tasks + plans they
 * touch (owner / designer / reviewer) for the selected month.
 * Built for "if it's a designer, what they have left" — summary
 * chips call out overdue + in-progress + blocked tasks, then a
 * filtered month grid (only that person's events), then two
 * right-rail lists (Tasks / Plans) for at-a-glance triage.
 */
function WorkloadView({
  workload,
  month,
  year,
  agencyTimezone,
  code,
  days,
  cells,
  todayYear,
  todayMonth,
  todayDay,
  members,
  assigneeId,
  workspaceSeries,
  t,
}: {
  workload: UserWorkload | null;
  month: number;
  year: number;
  agencyTimezone: string;
  code: LocaleCode;
  days: number;
  cells: number[];
  todayYear: number;
  todayMonth: number;
  todayDay: number;
  members: { id: string; name: string }[];
  assigneeId: string | undefined;
  /**
   * Workspace id → colour slot, computed once on the page from the full
   * agency list. Passed in (rather than recomputed per plan) so a
   * workspace keeps the SAME colour in the grid and in the right rail —
   * two independent computations would be free to disagree.
   */
  workspaceSeries: ReadonlyMap<string, number>;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const seriesFor = (workspaceId: string | null) =>
    workspaceSeriesSlot(workspaceSeries, workspaceId);
  // "Pick a person" empty state — user toggled workload but hasn't
  // chosen an assignee yet.
  if (!assigneeId) {
    return (
      <div
        className="border-border bg-surface text-body text-fg-secondary rounded-[var(--radius-card)] border p-6"
        data-testid="workload-empty-pick-assignee"
      >
        <h3 className="text-title-section text-fg-primary font-semibold">
          {t("calendar.workloadPickAssigneeTitle")}
        </h3>
        <p className="mt-2">{t("calendar.workloadPickAssigneeBody")}</p>
      </div>
    );
  }

  if (!workload) {
    return null;
  }

  const userName = workload.user?.name ?? t("calendar.workloadUnknownUser");
  const selectedMember = members.find((m) => m.id === assigneeId);
  if (!selectedMember) {
    return (
      <div
        className="border-border bg-surface text-body text-fg-secondary rounded-[var(--radius-card)] border p-6"
        data-testid="workload-empty-no-member"
      >
        <h3 className="text-title-section text-fg-primary font-semibold">
          {t("calendar.workloadMemberNotFoundTitle")}
        </h3>
      </div>
    );
  }

  // Merge tasks + plans into a single set of events for the grid,
  // marked with kind so the EventCard can render the right icon.
  const eventsForGrid: AgencyCalendarEvent[] = [
    ...workload.tasks.map((task) => ({
      id: task.id,
      kind: "task" as const,
      title: task.title,
      status: task.status,
      startsAt: task.startsAt,
      workspaceId: task.workspaceId,
      workspaceName: task.workspaceName,
      workspaceSlug: null,
      workspaceTimezone: null,
      assigneeName: userName,
      href: task.href,
    })),
    ...workload.plans.map((plan) => ({
      id: plan.id,
      kind: "plan" as const,
      title: plan.title,
      status: plan.status,
      startsAt: plan.startsAt,
      workspaceId: plan.workspaceId,
      workspaceName: plan.workspaceName,
      workspaceSlug: null,
      workspaceTimezone: null,
      assigneeName: userName,
      href: plan.href,
    })),
  ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const eventDateIsToday = (date: Date) => {
    const zoned = toZonedTime(date, agencyTimezone);
    return (
      zoned.getFullYear() === todayYear &&
      zoned.getMonth() === todayMonth &&
      zoned.getDate() === todayDay
    );
  };

  const dayEvents = (day: number) =>
    eventsForGrid.filter((event) => {
      const zoned = toZonedTime(event.startsAt, agencyTimezone);
      return zoned.getFullYear() === year && zoned.getMonth() === month && zoned.getDate() === day;
    });

  return (
    <div className="space-y-4" data-testid="workload-view">
      <header className="space-y-1">
        <h2 className="text-title-section text-fg-primary font-semibold">
          {t("calendar.workloadTitle", { name: userName })}
        </h2>
        <p className="text-body text-fg-secondary">{t("calendar.workloadSubtitle")}</p>
      </header>

      {/* Summary chips: overdue / in-progress / blocked / month totals.
       * Ordered by urgency so the eye lands on overdue first. */}
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label={t("calendar.workloadSummaryAriaLabel")}
        data-testid="workload-summary"
      >
        <SummaryChip
          label={t("calendar.workloadOverdue")}
          count={workload.summary.overdueTasks}
          tone={workload.summary.overdueTasks > 0 ? "danger" : "muted"}
          testId="workload-summary-overdue"
        />
        <SummaryChip
          label={t("calendar.workloadInProgress")}
          count={workload.summary.inProgressTasks}
          tone="primary"
          testId="workload-summary-in-progress"
        />
        <SummaryChip
          label={t("calendar.workloadBlocked")}
          count={workload.summary.blockedTasks}
          tone={workload.summary.blockedTasks > 0 ? "warning" : "muted"}
          testId="workload-summary-blocked"
        />
        <SummaryChip
          label={t("calendar.workloadTasksThisMonth")}
          count={workload.summary.tasksThisMonth}
          tone="muted"
          testId="workload-summary-tasks-this-month"
        />
        <SummaryChip
          label={t("calendar.workloadPlansThisMonth")}
          count={workload.summary.plansThisMonth}
          tone="muted"
          testId="workload-summary-plans-this-month"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="border-border bg-surface overflow-x-auto rounded-[var(--radius-card)] border">
          <div className="grid min-w-[760px] grid-cols-7">
            {weekdays(code).map((day) => (
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
              const isToday =
                inMonth && year === todayYear && month === todayMonth && day === todayDay;
              return (
                <div
                  key={index}
                  className={cn(
                    "border-border min-h-32 border-e border-b p-2",
                    !inMonth && "bg-surface-subtle/40",
                    isToday && "bg-primary/5 ring-primary/30 ring-1 ring-inset",
                  )}
                >
                  <span
                    {...(isToday ? { "aria-current": "date" as const } : {})}
                    className={cn(
                      "text-label",
                      isToday ? "text-primary font-bold" : "text-fg-muted",
                      !inMonth && "invisible",
                    )}
                  >
                    {day}
                  </span>
                  <div className="mt-2 space-y-1">
                    {events.slice(0, 4).map((event) => (
                      <CalendarEventCard
                        key={`${event.kind}-${event.id}`}
                        id={`${event.kind}-${event.id}-${day}`}
                        href={event.href}
                        title={event.title}
                        kind={event.kind}
                        variant="compact"
                        status={event.status}
                        statusLabel={eventStatusLabel(event, t)}
                        priority={event.priority}
                        priorityLabel={eventPriorityLabel(event, t) ?? undefined}
                        workspaceName={event.workspaceName}
                        workspaceSeries={seriesFor(event.workspaceId)}
                        assigneeName={event.assigneeName ?? null}
                        noWorkspaceLabel={t("calendar.globalNoWorkspace")}
                        kindLabel={
                          event.kind === "task"
                            ? t("calendar.globalTask")
                            : t("calendar.globalPlan")
                        }
                      />
                    ))}
                    {events.length > 4 ? (
                      <p className="text-label text-fg-muted px-1">+{events.length - 4}</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right rail (desktop) / below grid (mobile). Two lists:
         *  - Tasks: sorted by due date, status-coded.
         *  - Plans they're touching: role badge per row.
         * The unscheduled tasks (no due date) land in a sub-section
         * at the bottom so "what's on their plate" doesn't miss
         * work without a deadline.
         */}
        <aside className="space-y-4" data-testid="workload-rail">
          <WorkloadTasksList
            tasks={workload.tasks}
            unscheduled={workload.unscheduledTasks}
            workspaceSeries={workspaceSeries}
            t={t}
          />
          <WorkloadPlansList plans={workload.plans} workspaceSeries={workspaceSeries} t={t} />
        </aside>
      </div>

      {/* Mobile agenda (mirrors the calendar view pattern). Hidden
       * on md+ where the grid + rail take over. */}
      <section className="space-y-2 md:hidden" aria-label={t("calendar.workloadAgendaAriaLabel")}>
        {eventsForGrid.length === 0 ? (
          <div className="border-border bg-surface text-body text-fg-secondary rounded-[var(--radius-card)] border p-4">
            {t("calendar.workloadEmptyMonth")}
          </div>
        ) : (
          eventsForGrid.map((event) => (
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
              <CalendarEventCard
                id={`${event.kind}-${event.id}`}
                href={event.href}
                title={event.title}
                kind={event.kind}
                variant="default"
                status={event.status}
                statusLabel={eventStatusLabel(event, t)}
                priority={event.priority}
                priorityLabel={eventPriorityLabel(event, t) ?? undefined}
                workspaceName={event.workspaceName}
                workspaceSeries={seriesFor(event.workspaceId)}
                assigneeName={event.assigneeName ?? null}
                noWorkspaceLabel={t("calendar.globalNoWorkspace")}
                kindLabel={
                  event.kind === "task" ? t("calendar.globalTask") : t("calendar.globalPlan")
                }
              />
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function SummaryChip({
  label,
  count,
  tone,
  testId,
}: {
  label: string;
  count: number;
  tone: "primary" | "warning" | "danger" | "muted";
  testId: string;
}) {
  const toneClasses = {
    primary: "bg-primary-subtle text-primary",
    warning: "bg-warning-subtle text-warning",
    danger: "bg-danger-subtle text-danger",
    muted: "bg-surface-subtle text-fg-secondary",
  }[tone];
  return (
    <span
      data-testid={testId}
      className={cn("text-label rounded-full px-2.5 py-1 font-semibold", toneClasses)}
    >
      {label}: {count}
    </span>
  );
}

/**
 * WorkspaceDot — the coloured marker paired with a workspace name.
 *
 * `aria-hidden` on purpose: the workspace NAME is always rendered as
 * text right beside it, so the dot is a redundant cue rather than the
 * only carrier of identity (WCAG 1.4.1). A null series renders nothing
 * at all, so an event with no workspace is never painted in another
 * client's colour.
 */
function WorkspaceDot({ series, className }: { series: number | null; className?: string }) {
  if (series === null) return null;
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: workspaceSeriesVar(series) }}
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
    />
  );
}

function WorkloadTasksList({
  tasks,
  unscheduled,
  workspaceSeries,
  t,
}: {
  tasks: WorkloadTask[];
  unscheduled: WorkloadTask[];
  workspaceSeries: ReadonlyMap<string, number>;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const seriesFor = (workspaceId: string | null) =>
    workspaceSeriesSlot(workspaceSeries, workspaceId);
  if (tasks.length === 0 && unscheduled.length === 0) {
    return (
      <section
        className="border-border bg-surface text-body text-fg-secondary rounded-[var(--radius-card)] border p-4"
        data-testid="workload-tasks-empty"
      >
        <h3 className="text-title-section text-fg-primary font-semibold">
          {t("calendar.workloadTasksTitle")}
        </h3>
        <p className="mt-2">{t("calendar.workloadTasksEmpty")}</p>
      </section>
    );
  }
  return (
    <section
      className="border-border bg-surface rounded-[var(--radius-card)] border p-4"
      data-testid="workload-tasks-list"
    >
      <h3 className="text-title-section text-fg-primary font-semibold">
        {t("calendar.workloadTasksTitle")}
      </h3>
      <ul className="mt-3 space-y-2">
        {tasks.map((task) => (
          <li key={task.id}>
            <Link
              href={task.href}
              className="border-border bg-surface-subtle hover:border-primary/50 focus-visible:ring-focus-ring block rounded-[var(--radius-control)] border p-2 focus-visible:ring-2 focus-visible:outline-none"
            >
              <span className="text-label text-fg-secondary font-semibold">
                {formatDate(task.startsAt, "en", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
              <span className="text-body text-fg-primary mt-1 block font-semibold wrap-break-word">
                {task.title}
              </span>
              <span className="text-label text-fg-muted mt-1 flex min-w-0 items-center gap-1.5">
                <WorkspaceDot series={seriesFor(task.workspaceId)} />
                <span className="truncate">
                  {task.workspaceName ?? t("calendar.globalNoWorkspace")} ·{" "}
                  {t(`tasks.status.${task.status}`)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {unscheduled.length > 0 ? (
        <details className="mt-3">
          <summary className="text-label text-fg-secondary cursor-pointer font-semibold">
            {t("calendar.workloadUnscheduledLabel", { count: unscheduled.length })}
          </summary>
          <ul className="mt-2 space-y-2">
            {unscheduled.map((task) => (
              <li key={task.id}>
                <Link
                  href={task.href}
                  className="border-border bg-surface-subtle hover:border-primary/50 focus-visible:ring-focus-ring block rounded-[var(--radius-control)] border p-2 focus-visible:ring-2 focus-visible:outline-none"
                >
                  <span className="text-body text-fg-primary block font-semibold wrap-break-word">
                    {task.title}
                  </span>
                  <span className="text-label text-fg-muted mt-1 flex min-w-0 items-center gap-1.5">
                    <WorkspaceDot series={seriesFor(task.workspaceId)} />
                    <span className="truncate">
                      {task.workspaceName ?? t("calendar.globalNoWorkspace")} ·{" "}
                      {t(`tasks.status.${task.status}`)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function WorkloadPlansList({
  plans,
  workspaceSeries,
  t,
}: {
  plans: WorkloadPlan[];
  workspaceSeries: ReadonlyMap<string, number>;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const seriesFor = (workspaceId: string | null) =>
    workspaceSeriesSlot(workspaceSeries, workspaceId);
  if (plans.length === 0) {
    return (
      <section
        className="border-border bg-surface text-body text-fg-secondary rounded-[var(--radius-card)] border p-4"
        data-testid="workload-plans-empty"
      >
        <h3 className="text-title-section text-fg-primary font-semibold">
          {t("calendar.workloadPlansTitle")}
        </h3>
        <p className="mt-2">{t("calendar.workloadPlansEmpty")}</p>
      </section>
    );
  }
  return (
    <section
      className="border-border bg-surface rounded-[var(--radius-card)] border p-4"
      data-testid="workload-plans-list"
    >
      <h3 className="text-title-section text-fg-primary font-semibold">
        {t("calendar.workloadPlansTitle")}
      </h3>
      <ul className="mt-3 space-y-2">
        {plans.map((plan) => (
          <li key={plan.id}>
            <Link
              href={plan.href}
              className="border-border bg-surface-subtle hover:border-primary/50 focus-visible:ring-focus-ring block rounded-[var(--radius-control)] border p-2 focus-visible:ring-2 focus-visible:outline-none"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-body text-fg-primary font-semibold wrap-break-word">
                  {plan.title}
                </span>
                <span
                  data-testid={`workload-role-${plan.role}`}
                  className="bg-primary-subtle text-primary text-label shrink-0 rounded-full px-2 py-0.5 font-semibold"
                >
                  {t(`calendar.workloadRole.${plan.role}`)}
                </span>
              </div>
              <span className="text-label text-fg-muted mt-1 flex min-w-0 items-center gap-1.5">
                <WorkspaceDot series={seriesFor(plan.workspaceId)} />
                <span className="truncate">
                  {formatDate(plan.startsAt, "en", {
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  · {plan.workspaceName} · {t(`planningFilters.statusLabels.${plan.status}`)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
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
    /**
     * View mode (round-of-2026-09-27, workload feature):
     *  - "calendar" (default) — the agency-wide month grid with
     *    existing filter behaviour. Assignee filter is task-only.
     *  - "workload" — single-user workload panel: summary chips,
     *    monthly grid filtered to that user's tasks + plans they
     *    touch (owner / designer / reviewer), right-rail lists.
     */
    view?: string;
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
  // value when the user submits. We read the array (Next.js
  // searchParams can be `string | string[]`) and resolve with
  // "true wins" — a checked checkbox submits `["false", "true"]`,
  // an unchecked one submits `["false"]`.
  //
  // IMPORTANT: a fresh visit (no query string at all, no form
  // submission yet) delivers `undefined` here, NOT `["false"]`.
  // The hidden input only goes on the wire when the form is
  // submitted. So `undefined` must mean "default to true" — both
  // the previous `!== "false"` form and the current
  // `.includes("true")` form assumed the value would always be
  // present; the current one regressed because `undefined.includes
  // ...` short-circuits to `false` and silently hid every event on
  // a cold visit.
  const showPlansValues = requestedParams.showPlans
    ? ([] as string[]).concat(requestedParams.showPlans)
    : [];
  const showTasksValues = requestedParams.showTasks
    ? ([] as string[]).concat(requestedParams.showTasks)
    : [];
  const showPlans = showPlansValues.length === 0 ? true : showPlansValues.includes("true");
  const showTasks = showTasksValues.length === 0 ? true : showTasksValues.includes("true");
  // "workload" forces assigneeId — fall back to whatever is on the
  // URL, or "no assignee yet" empty state in the view.
  const view: "calendar" | "workload" =
    requestedParams.view === "workload" ? "workload" : "calendar";
  const [agencyTimezone, members, workspaces] = await Promise.all([
    getAgencyTimezone(actor, context.agencyId),
    listAgencyMembers(context.agencyId),
    listAgencyWorkspaces(context.agencyId),
  ]);
  /**
   * Deterministic colour per workspace, computed ONCE from the full
   * agency list rather than per-event. Assigning from the whole list is
   * what guarantees neighbouring workspaces get neighbouring hues —
   * a per-event hash would let two visible workspaces collide while a
   * third colour sat unused.
   */
  const workspaceSeries = assignWorkspaceSeries(workspaces);
  const seriesFor = (workspaceId: string | null) =>
    workspaceSeriesSlot(workspaceSeries, workspaceId);
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
  // Workload view: only loaded when the user has selected the view
  // AND picked a valid assignee. Skipping the fetch when assigneeId
  // is missing keeps cold visits to /app/calendar?view=workload
  // cheap (the page renders the "pick a person" empty state).
  const workload: UserWorkload | null =
    view === "workload" && assigneeId
      ? await getUserWorkload(actor, context.agencyId, assigneeId, monthRange.start, monthRange.end)
      : null;
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
  /**
   * Workspace legend href builder. Preserves every OTHER active filter
   * (month, assignee, status, show flags, view) so clicking a client in
   * the legend isolates that workspace without discarding the rest of
   * the user's context — the same round-trip guarantee `queryFor` makes
   * for the month arrows. Passing `null` clears the workspace filter.
   */
  const hrefForWorkspace = (targetWorkspaceId: string | null) => {
    const params = new URLSearchParams({ month: selectedMonth });
    if (targetWorkspaceId) params.set("workspaceId", targetWorkspaceId);
    if (assigneeId) params.set("assigneeId", assigneeId);
    if (taskStatus) params.set("taskStatus", taskStatus);
    if (!showPlans) params.set("showPlans", "false");
    if (!showTasks) params.set("showTasks", "false");
    if (view === "workload") params.set("view", "workload");
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
  const hasFilters = Boolean(workspaceId || assigneeId || taskStatus || !showPlans || !showTasks);
  const taskViewParams = new URLSearchParams();
  if (workspaceId) taskViewParams.set("workspaceId", workspaceId);
  if (assigneeId) taskViewParams.set("assigneeId", assigneeId);
  if (taskStatus) taskViewParams.set("status", taskStatus);
  const tasksHref = `/app/tasks${taskViewParams.toString() ? `?${taskViewParams.toString()}` : ""}`;
  // Build the "switch view" URLs. The toggle preserves the current
  // month + assignee + workspaceId + status + show flags so the user
  // doesn't lose their filter context when flipping modes.
  const workloadHref = (() => {
    const params = new URLSearchParams();
    params.set("month", selectedMonth);
    params.set("view", "workload");
    if (assigneeId) params.set("assigneeId", assigneeId);
    if (workspaceId) params.set("workspaceId", workspaceId);
    return `?${params.toString()}`;
  })();
  const calendarHref = (() => {
    const params = new URLSearchParams({ month: selectedMonth });
    if (workspaceId) params.set("workspaceId", workspaceId);
    if (assigneeId) params.set("assigneeId", assigneeId);
    if (taskStatus) params.set("taskStatus", taskStatus);
    if (!showPlans) params.set("showPlans", "false");
    if (!showTasks) params.set("showTasks", "false");
    return `?${params.toString()}`;
  })();
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
      {/* View toggle (round-of-2026-09-27, workload feature). */}
      <ViewToggle view={view} calendarHref={calendarHref} workloadHref={workloadHref} t={t} />
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
          {/* Preserve the current view across filter submissions so
           * toggling "Show tasks" or picking an assignee doesn't
           * accidentally knock the user back to Calendar view. */}
          {view === "workload" ? <input type="hidden" name="view" value="workload" /> : null}
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
      {/*
        Calendar filter feedback (gap from round-of-2026-09-27):
        The assignee + status filters ONLY affect tasks; plans stay
        visible regardless. When the user picks an assignee who has no
        tasks this month, `calendar.events.length` barely moves (plans
        dominate the count) and the calendar looks visually identical
        to the unfiltered view — making the filter feel broken.

        To make the filter behaviour obvious, the count is split into
        plan / task breakdown and a hint is rendered when the active
        task filter reduces the task list to zero. The hint is shown
        only when an assignee OR status filter is active AND the
        task count is zero — otherwise the breakdown alone is enough.
      */}
      <CalendarCountSummary
        events={calendar.events}
        assigneeName={
          assigneeId ? (members.find((member) => member.id === assigneeId)?.name ?? null) : null
        }
        statusLabel={taskStatus ? (t(`tasks.status.${taskStatus}`) as string) : null}
        hasTaskFilter={Boolean(assigneeId || taskStatus)}
        t={t}
      />
      {/*
        Workspace legend — the key that decodes the coloured dots on
        every card below, and the fastest way to isolate one client.
        Each chip is a link that preserves the month, assignee, status,
        show flags and current view, so switching workspace never drops
        the rest of the user's filters.
      */}
      <WorkspaceLegend
        workspaces={workspaces.map((workspace) => ({
          id: workspace.id,
          name: workspace.name,
          series: seriesFor(workspace.id) ?? 0,
        }))}
        activeWorkspaceId={workspaceId ?? null}
        buildHref={hrefForWorkspace}
        label={t("calendar.globalWorkspaceLegendAriaLabel")}
        allLabel={t("calendar.globalAnyWorkspace")}
      />
      {/* Workload view body (round-of-2026-09-27). Replaces the
       * calendar grid + unscheduled section when the user toggles
       * the Workload tab. The filters above remain visible so the
       * user can still pick a different assignee without bouncing
       * back to Calendar view. */}
      {view === "workload" ? (
        <WorkloadView
          workload={workload}
          month={month}
          year={year}
          agencyTimezone={calendar.agencyTimezone}
          code={code as LocaleCode}
          days={days}
          cells={cells}
          todayYear={todayYear}
          todayMonth={todayMonth}
          todayDay={todayDay}
          members={members}
          assigneeId={assigneeId}
          workspaceSeries={workspaceSeries}
          t={t}
        />
      ) : null}
      {/* The mobile agenda + desktop grid + unscheduled section are
       * the agency-wide Calendar view body. Workload view already
       * rendered its own grid + rail above, so we hide these. */}
      {view === "calendar" ? (
        <>
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
                  <CalendarEventCard
                    id={`${event.kind}-${event.id}`}
                    href={event.href}
                    title={event.title}
                    kind={event.kind}
                    variant="default"
                    status={event.status}
                    statusLabel={eventStatusLabel(event, t)}
                    priority={event.priority}
                    priorityLabel={eventPriorityLabel(event, t) ?? undefined}
                    workspaceName={event.workspaceName}
                    workspaceSeries={seriesFor(event.workspaceId)}
                    assigneeName={event.assigneeName ?? null}
                    noWorkspaceLabel={t("calendar.globalNoWorkspace")}
                    kindLabel={
                      event.kind === "task" ? t("calendar.globalTask") : t("calendar.globalPlan")
                    }
                  />
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
                        <CalendarEventCard
                          key={`${event.kind}-${event.id}`}
                          id={`${event.kind}-${event.id}-${day}`}
                          href={event.href}
                          title={event.title}
                          kind={event.kind}
                          variant="compact"
                          status={event.status}
                          statusLabel={eventStatusLabel(event, t)}
                          priority={event.priority}
                          priorityLabel={eventPriorityLabel(event, t) ?? undefined}
                          workspaceName={event.workspaceName}
                          workspaceSeries={seriesFor(event.workspaceId)}
                          assigneeName={event.assigneeName ?? null}
                          noWorkspaceLabel={t("calendar.globalNoWorkspace")}
                          kindLabel={
                            event.kind === "task"
                              ? t("calendar.globalTask")
                              : t("calendar.globalPlan")
                          }
                        />
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
                      <span className="text-label text-fg-muted mt-1 flex min-w-0 items-center gap-1.5">
                        <WorkspaceDot series={seriesFor(task.workspaceId)} />
                        <span className="truncate">
                          {task.workspaceName ?? t("calendar.globalNoWorkspace")}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
