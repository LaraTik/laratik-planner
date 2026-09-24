import Link from "next/link";
import { CalendarClock, ClipboardList, Filter, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/workspace/page-header";
import { Pagination } from "@/components/workspace/pagination";
import { FormField } from "@/components/forms/form-field";
import { TaskStatusBadge } from "@/components/tasks/task-status-badge";
import { formatDate } from "@/lib/i18n/format-locale";
import {
  listAgencyMembers,
  listAgencyWorkspaces,
  listTasks,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/tasks/service";
import type { Actor } from "@/lib/auth/policy";
import type { LocaleCode } from "@/lib/i18n/locales";

export async function TaskListPage({
  actor,
  agencyId,
  mine,
  searchParams,
  t,
  code,
}: {
  actor: Actor;
  agencyId: string;
  mine: boolean;
  searchParams: Record<string, string | undefined>;
  t: (key: string, params?: Record<string, string | number>) => string;
  code: LocaleCode;
}) {
  const [members, workspaces, result] = await Promise.all([
    listAgencyMembers(agencyId),
    listAgencyWorkspaces(agencyId),
    listTasks(actor, {
      agencyId,
      page: Number(searchParams.page ?? 1),
      pageSize: 20,
      search: searchParams.search,
      status: TASK_STATUSES.includes(searchParams.status as TaskStatus)
        ? (searchParams.status as TaskStatus)
        : undefined,
      priority: TASK_PRIORITIES.includes(searchParams.priority as TaskPriority)
        ? (searchParams.priority as TaskPriority)
        : undefined,
      workspaceId: searchParams.workspaceId,
      assigneeId: mine ? actor.id : searchParams.assigneeId,
      mine,
      overdue: searchParams.overdue === "true",
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const currentTime = new Date();
  const hasFilters = Boolean(
    searchParams.search ||
    searchParams.status ||
    searchParams.priority ||
    searchParams.workspaceId ||
    searchParams.assigneeId ||
    searchParams.overdue === "true",
  );
  const buildHref = (page: number) => {
    const params = new URLSearchParams();
    if (searchParams.search) params.set("search", searchParams.search);
    if (searchParams.status) params.set("status", searchParams.status);
    if (searchParams.priority) params.set("priority", searchParams.priority);
    if (searchParams.workspaceId) params.set("workspaceId", searchParams.workspaceId);
    if (searchParams.assigneeId && !mine) params.set("assigneeId", searchParams.assigneeId);
    if (searchParams.overdue === "true") params.set("overdue", "true");
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    return `/app/tasks${mine ? "/mine" : ""}${query ? `?${query}` : ""}`;
  };
  return (
    <div className="space-y-6">
      <PageHeader
        title={t(mine ? "tasks.myTitle" : "tasks.title")}
        description={t(mine ? "tasks.myDescription" : "tasks.description")}
        action={
          <Button asChild>
            <Link href="/app/tasks/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("tasks.newTask")}
            </Link>
          </Button>
        }
      />
      <nav className="flex flex-wrap items-center gap-2" aria-label={t("tasks.title")}>
        <Link
          href={buildHref(1).replace("/app/tasks/mine", "/app/tasks")}
          className={`text-body inline-flex min-h-11 items-center rounded-[var(--radius-control)] border px-3 font-semibold ${!mine ? "border-primary bg-primary-subtle text-primary" : "border-border bg-surface text-fg-secondary"}`}
          aria-current={!mine ? "page" : undefined}
        >
          {t("tasks.allTasks")}
        </Link>
        <Link
          href={buildHref(1).replace("/app/tasks", "/app/tasks/mine")}
          className={`text-body inline-flex min-h-11 items-center rounded-[var(--radius-control)] border px-3 font-semibold ${mine ? "border-primary bg-primary-subtle text-primary" : "border-border bg-surface text-fg-secondary"}`}
          aria-current={mine ? "page" : undefined}
        >
          {t("tasks.myTasks")}
        </Link>
      </nav>
      <Card padding="md">
        <form
          method="get"
          className="grid gap-3 lg:grid-cols-[minmax(15rem,1fr)_repeat(4,minmax(9rem,1fr))_auto] lg:items-end"
        >
          <FormField id="task-search" label={t("tasks.searchLabel")}>
            <input
              name="search"
              defaultValue={searchParams.search}
              placeholder={t("tasks.searchPlaceholder")}
              className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring mt-1 min-h-11 w-full rounded-[var(--radius-control)] border px-3 focus-visible:ring-2"
            />
          </FormField>
          <FormField id="task-status" label={t("tasks.statusLabel")}>
            <select
              name="status"
              defaultValue={searchParams.status ?? ""}
              className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring mt-1 min-h-11 w-full rounded-[var(--radius-control)] border px-2 focus-visible:ring-2"
            >
              <option value="">{t("tasks.anyStatus")}</option>
              {TASK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`tasks.status.${status}`)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="task-priority" label={t("tasks.priorityLabel")}>
            <select
              name="priority"
              defaultValue={searchParams.priority ?? ""}
              className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring mt-1 min-h-11 w-full rounded-[var(--radius-control)] border px-2 focus-visible:ring-2"
            >
              <option value="">{t("tasks.anyPriority")}</option>
              {TASK_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {t(`tasks.priority.${priority}`)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="task-workspace" label={t("tasks.workspaceLabel")}>
            <select
              name="workspaceId"
              defaultValue={searchParams.workspaceId ?? ""}
              className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring mt-1 min-h-11 w-full rounded-[var(--radius-control)] border px-2 focus-visible:ring-2"
            >
              <option value="">{t("tasks.anyWorkspace")}</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </FormField>
          {!mine ? (
            <FormField id="task-assignee" label={t("tasks.assigneeLabel")}>
              <select
                name="assigneeId"
                defaultValue={searchParams.assigneeId ?? ""}
                className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring mt-1 min-h-11 w-full rounded-[var(--radius-control)] border px-2 focus-visible:ring-2"
              >
                <option value="">{t("tasks.anyAssignee")}</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </FormField>
          ) : (
            <span className="hidden lg:block" />
          )}
          <div className="flex flex-wrap items-end gap-2">
            <FormField id="task-overdue" label={t("tasks.allDueDates")}>
              <select
                name="overdue"
                aria-label={t("tasks.overdueOnly")}
                defaultValue={searchParams.overdue === "true" ? "true" : ""}
                className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring min-h-11 rounded-[var(--radius-control)] border px-2 focus-visible:ring-2"
              >
                <option value="">{t("tasks.allDueDates")}</option>
                <option value="true">{t("tasks.overdueOnly")}</option>
              </select>
            </FormField>
            <Button type="submit" variant="secondary">
              <Filter className="h-4 w-4" aria-hidden="true" />
              {t("tasks.applyFilters")}
            </Button>
          </div>
        </form>
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-2" aria-live="polite">
        <p className="text-label text-fg-secondary">
          {t("tasks.showing", { count: result.total })}
        </p>
        {hasFilters ? (
          <Link
            href={mine ? "/app/tasks/mine" : "/app/tasks"}
            className="text-body text-primary focus-visible:ring-focus-ring inline-flex min-h-10 items-center font-semibold underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            {t("tasks.clearFilters")}
          </Link>
        ) : null}
      </div>
      {result.rows.length === 0 ? (
        <Card variant="dashed" padding="lg">
          <EmptyState
            icon={<ClipboardList className="h-8 w-8" aria-hidden="true" />}
            title={t("tasks.emptyTitle")}
            description={t("tasks.emptyDescription")}
            action={
              <Button asChild>
                <Link href="/app/tasks/new">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {t("tasks.createFirst")}
                </Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3" data-testid="task-list">
          {result.rows.map((task) => {
            const overdue =
              task.dueAt &&
              task.dueAt.getTime() < currentTime.getTime() &&
              task.status !== "done" &&
              task.status !== "cancelled";
            return (
              <Link
                key={task.id}
                href={`/app/tasks/${task.id}`}
                className="border-border bg-surface hover:border-primary/50 focus-visible:ring-focus-ring block rounded-[var(--radius-card)] border p-4 transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-body text-fg-primary font-semibold wrap-break-word">
                      {task.title}
                    </h2>
                    <p className="text-label text-fg-secondary mt-1">
                      {task.workspaceName ?? t("calendar.globalNoWorkspace")}
                      <span aria-hidden="true"> · </span>
                      {task.assigneeName ?? t("tasks.noAssignee")}
                    </p>
                  </div>
                  <TaskStatusBadge
                    status={task.status as TaskStatus}
                    label={t(`tasks.status.${task.status}`)}
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span
                    className={`text-label inline-flex items-center gap-1 ${overdue ? "text-danger font-semibold" : "text-fg-muted"}`}
                  >
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                    {task.dueAt
                      ? formatDate(task.dueAt, code, {
                          dateStyle: "medium",
                          ...(task.workspaceName ? {} : { timeZone: "UTC" }),
                        })
                      : t("tasks.noDueDate")}
                  </span>
                  <span className="text-label border-border text-fg-secondary rounded-full border px-2 py-0.5">
                    {t(`tasks.priority.${task.priority}`)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      <Pagination
        currentPage={result.page}
        totalPages={totalPages}
        totalCount={result.total}
        pageSize={result.pageSize}
        buildHref={buildHref}
        t={t}
      />
    </div>
  );
}
