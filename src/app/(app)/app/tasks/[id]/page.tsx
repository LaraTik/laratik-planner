import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Archive,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Paperclip,
  UserRound,
} from "lucide-react";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import {
  getTaskDetail,
  listAgencyMembers,
  listAgencyWorkspaces,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskStatus,
} from "@/lib/tasks/service";
import { listTaskAttachmentUrls } from "@/lib/tasks/attachments";
import { tForActive } from "@/lib/i18n/t-for-active";
import { formatDate } from "@/lib/i18n/format-locale";
import { PageHeader } from "@/components/workspace/page-header";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/forms/form-field";
import { TaskStatusBadge } from "@/components/tasks/task-status-badge";
import { TaskAttachmentUpload } from "@/components/tasks/task-attachment-upload";
import {
  updateTaskAction,
  archiveTaskAction,
  restoreTaskAction,
} from "@/app/(app)/app/tasks/actions";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { formatTaskDuration, taskDurationMinutes } from "@/lib/tasks/time";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await tForActive();
  return { title: t("tasks.title") };
}

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { t, code } = await tForActive();
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  const context = await resolveActiveAgencyContext({ actor });
  if (!context) redirect("/setup");
  const taskId = (await params).id;
  let task;
  try {
    task = await getTaskDetail(actor, taskId);
  } catch {
    notFound();
  }
  if (!task) notFound();
  const [members, workspaces, attachments] = await Promise.all([
    listAgencyMembers(task.agencyId),
    listAgencyWorkspaces(task.agencyId),
    listTaskAttachmentUrls(actor, task.id),
  ]);
  const durationMinutes = taskDurationMinutes(task.startedAt, task.completedAt);
  const durationLabel =
    durationMinutes === null ? t("tasks.notStarted") : formatTaskDuration(durationMinutes, t);
  return (
    <div className="space-y-6">
      <PageHeader
        title={task.title}
        description={t("tasks.detailDescription")}
        action={
          <Link
            href="/app/tasks"
            className="text-body text-primary font-semibold underline-offset-4 hover:underline"
          >
            {t("tasks.allTasks")}
          </Link>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Card padding="lg">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <TaskStatusBadge
                  status={task.status as TaskStatus}
                  label={t(`tasks.status.${task.status}`)}
                />
                <p className="text-label text-fg-secondary mt-3">
                  {task.workspaceName ?? t("calendar.globalNoWorkspace")}
                  <span aria-hidden="true"> · </span>
                  {task.assigneeName ?? t("tasks.noAssignee")}
                </p>
              </div>
              <span className="text-label border-border text-fg-secondary rounded-full border px-2.5 py-1">
                {t(`tasks.priority.${task.priority}`)}
              </span>
            </div>
            {task.canManage ? (
              <form action={updateTaskAction.bind(null, task.id)} className="mt-6 space-y-5">
                <FormField id="detail-title" label={t("tasks.titleLabel")} required>
                  <input
                    name="title"
                    defaultValue={task.title}
                    maxLength={200}
                    required
                    className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring mt-1 block min-h-11 w-full rounded-[var(--radius-control)] border px-3 font-normal focus-visible:ring-2"
                  />
                </FormField>
                <FormField id="detail-description" label={t("tasks.descriptionLabel")}>
                  <textarea
                    name="description"
                    defaultValue={task.description}
                    rows={6}
                    maxLength={10000}
                    className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring mt-1 block w-full rounded-[var(--radius-control)] border px-3 py-2 font-normal focus-visible:ring-2"
                  />
                </FormField>
                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField id="detail-status" label={t("tasks.statusLabel")}>
                    <select
                      name="status"
                      defaultValue={task.status}
                      className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring mt-1 block min-h-11 w-full rounded-[var(--radius-control)] border px-3 font-normal focus-visible:ring-2"
                    >
                      {TASK_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {t(`tasks.status.${status}`)}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField id="detail-priority" label={t("tasks.priorityLabel")}>
                    <select
                      name="priority"
                      defaultValue={task.priority}
                      className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring mt-1 block min-h-11 w-full rounded-[var(--radius-control)] border px-3 font-normal focus-visible:ring-2"
                    >
                      {TASK_PRIORITIES.map((priority) => (
                        <option key={priority} value={priority}>
                          {t(`tasks.priority.${priority}`)}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField id="detail-workspace" label={t("tasks.workspaceLabel")}>
                    <select
                      name="workspaceId"
                      defaultValue={task.workspaceId ?? ""}
                      className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring mt-1 block min-h-11 w-full rounded-[var(--radius-control)] border px-3 font-normal focus-visible:ring-2"
                    >
                      <option value="">{t("tasks.noWorkspace")}</option>
                      {workspaces.map((workspace) => (
                        <option key={workspace.id} value={workspace.id}>
                          {workspace.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField id="detail-assignee" label={t("tasks.assigneeLabel")}>
                    <select
                      name="assigneeId"
                      defaultValue={task.assigneeId ?? ""}
                      className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring mt-1 block min-h-11 w-full rounded-[var(--radius-control)] border px-3 font-normal focus-visible:ring-2"
                    >
                      <option value="">{t("tasks.noAssignee")}</option>
                      {members.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField id="detail-due" label={t("tasks.dueLabel")}>
                    <input
                      name="dueDate"
                      type="date"
                      defaultValue={task.dueAt ? task.dueAt.toISOString().slice(0, 10) : ""}
                      className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring mt-1 block min-h-11 w-full rounded-[var(--radius-control)] border px-3 font-normal focus-visible:ring-2"
                    />
                  </FormField>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit">{t("tasks.saveChanges")}</Button>
                  <p className="text-label text-fg-muted">{t("tasks.transitionHint")}</p>
                </div>
              </form>
            ) : (
              <p className="text-body text-fg-secondary mt-6 whitespace-pre-wrap">
                {task.description || t("tasks.emptyDescription")}
              </p>
            )}
          </Card>
          <Card padding="lg">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>{t("tasks.attachments")}</CardTitle>
                <CardDescription>{t("tasks.detailDescription")}</CardDescription>
              </div>
              {task.canManage ? (
                <TaskAttachmentUpload
                  taskId={task.id}
                  label={t("tasks.addAttachment")}
                  uploadingLabel={t("tasks.uploading")}
                  errorLabel={t("tasks.uploadError")}
                />
              ) : null}
            </div>
            {attachments.length ? (
              <ul className="mt-5 space-y-2">
                {attachments.map((attachment) => (
                  <li
                    key={attachment.id}
                    className="border-border flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border px-3 py-2"
                  >
                    <span className="text-body inline-flex min-w-0 items-center gap-2">
                      <Paperclip className="text-fg-muted h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="wrap-break-word">{attachment.originalName}</span>
                    </span>
                    <a
                      href={attachment.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-label text-primary inline-flex min-h-9 items-center gap-1 font-semibold underline-offset-4 hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("common.rowActionOpen")}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body text-fg-muted mt-5">{t("common.empty")}</p>
            )}
          </Card>
          <Card padding="lg">
            <CardTitle>{t("tasks.activity")}</CardTitle>
            <ol className="border-border mt-5 space-y-4 border-s-2 ps-4">
              {task.events.map((event) => (
                <li key={event.id} className="relative">
                  <span
                    className="bg-primary absolute -start-[1.4rem] top-1 h-2.5 w-2.5 rounded-full"
                    aria-hidden="true"
                  />
                  <p className="text-body text-fg-primary font-semibold">{event.summary}</p>
                  <p className="text-label text-fg-muted mt-1">
                    {event.actorName ?? t("tasks.unknownActor")} ·{" "}
                    {formatDate(event.createdAt, code, { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <aside className="space-y-4">
          <Card padding="md">
            <h2 className="text-title-section text-fg-primary font-semibold">
              {t("tasks.dueLabel")}
            </h2>
            <p className="text-body text-fg-secondary mt-2 inline-flex items-center gap-2">
              <CalendarClock className="h-4 w-4" aria-hidden="true" />
              {task.dueAt
                ? formatDate(task.dueAt, code, { dateStyle: "medium" })
                : t("tasks.noDueDate")}
            </p>
            <p className="text-label text-fg-muted mt-3 inline-flex items-center gap-2">
              <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
              {task.assigneeName ?? t("tasks.noAssignee")}
            </p>
          </Card>
          <Card padding="md">
            <h2 className="text-title-section text-fg-primary font-semibold">
              {t("tasks.timeTracking")}
            </h2>
            <p className="text-body text-fg-secondary mt-2 inline-flex items-center gap-2">
              <Clock3 className="h-4 w-4" aria-hidden="true" />
              {task.completedAt ? t("tasks.timeToComplete") : t("tasks.elapsedTime")}:{" "}
              {durationLabel}
            </p>
            <dl className="text-label text-fg-muted mt-3 space-y-1">
              <div className="flex justify-between gap-3">
                <dt>{t("tasks.startedAt")}</dt>
                <dd>
                  {task.startedAt
                    ? formatDate(task.startedAt, code, { dateStyle: "medium", timeStyle: "short" })
                    : t("tasks.notStarted")}
                </dd>
              </div>
              {task.completedAt ? (
                <div className="flex justify-between gap-3">
                  <dt>{t("tasks.completedAt")}</dt>
                  <dd>
                    {formatDate(task.completedAt, code, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </dd>
                </div>
              ) : null}
            </dl>
          </Card>
          {task.canArchive && !task.archivedAt ? (
            <Card padding="md">
              <form action={archiveTaskAction.bind(null, task.id)}>
                <Button type="submit" variant="destructive">
                  <Archive className="h-4 w-4" aria-hidden="true" />
                  {t("tasks.archive")}
                </Button>
                <p className="text-label text-fg-muted mt-2">{t("tasks.archiveConfirm")}</p>
              </form>
            </Card>
          ) : null}
          {task.canRestore ? (
            <Card padding="md">
              <form action={restoreTaskAction.bind(null, task.id)}>
                <Button type="submit" variant="secondary">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  {t("tasks.restore")}
                </Button>
              </form>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
