import "server-only";

import { and, asc, count, desc, eq, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agencyMemberships,
  agencyTasks,
  taskActivityEvents,
  taskAttachments,
  users,
  workspaces,
} from "@/lib/db/schema";
import {
  isAgencyAdmin,
  isAgencyMember,
  type Actor,
  PermissionDeniedError,
} from "@/lib/auth/policy";
import { canTransitionTaskStatus, type TaskStatus } from "@/lib/tasks/workflow";

type TaskTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export { TASK_STATUSES, canTransitionTaskStatus } from "@/lib/tasks/workflow";
export type { TaskStatus } from "@/lib/tasks/workflow";

export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export type TaskCreateInput = {
  agencyId: string;
  title: string;
  description?: string | undefined;
  workspaceId?: string | null | undefined;
  assigneeId?: string | null | undefined;
  dueAt?: Date | null | undefined;
  priority?: TaskPriority | undefined;
};

export type TaskUpdateInput = {
  title?: string | undefined;
  description?: string | undefined;
  workspaceId?: string | null | undefined;
  assigneeId?: string | null | undefined;
  dueAt?: Date | null | undefined;
  priority?: TaskPriority | undefined;
  status?: TaskStatus | undefined;
};

export type TaskListOptions = {
  agencyId: string;
  page?: number | undefined;
  pageSize?: number | undefined;
  search?: string | undefined;
  status?: TaskStatus | undefined;
  priority?: TaskPriority | undefined;
  workspaceId?: string | undefined;
  assigneeId?: string | undefined;
  mine?: boolean | undefined;
  overdue?: boolean | undefined;
};

function assertTitle(title: string): string {
  const value = title.trim();
  if (value.length < 1 || value.length > 200) throw new Error("task.title_invalid");
  return value;
}

async function assertWorkspaceInAgency(agencyId: string, workspaceId: string | null | undefined) {
  if (!workspaceId) return;
  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.agencyId, agencyId)))
    .limit(1);
  if (!workspace) throw new Error("task.workspace_invalid");
}

async function assertUserInAgency(agencyId: string, userId: string | null | undefined) {
  if (!userId) return;
  const [member] = await db
    .select({ userId: agencyMemberships.userId })
    .from(agencyMemberships)
    .where(
      and(
        eq(agencyMemberships.agencyId, agencyId),
        eq(agencyMemberships.userId, userId),
        eq(agencyMemberships.status, "active"),
      ),
    )
    .limit(1);
  if (!member) throw new Error("task.assignee_invalid");
}

async function recordActivity(
  tx: TaskTransaction,
  input: {
    agencyId: string;
    taskId: string;
    actorId: string;
    kind: string;
    summary: string;
    beforeData?: Record<string, unknown>;
    afterData?: Record<string, unknown>;
  },
) {
  await tx.insert(taskActivityEvents).values({
    agencyId: input.agencyId,
    taskId: input.taskId,
    actorId: input.actorId,
    kind: input.kind,
    summary: input.summary,
    ...(input.beforeData ? { beforeData: input.beforeData } : {}),
    ...(input.afterData ? { afterData: input.afterData } : {}),
  });
}

export async function createTask(actor: Actor, input: TaskCreateInput) {
  if (!(await isAgencyMember(actor, input.agencyId))) {
    throw new PermissionDeniedError("task.create");
  }
  await assertWorkspaceInAgency(input.agencyId, input.workspaceId);
  await assertUserInAgency(input.agencyId, input.assigneeId);
  const title = assertTitle(input.title);
  const now = new Date();
  return db.transaction(async (tx) => {
    const [task] = await tx
      .insert(agencyTasks)
      .values({
        agencyId: input.agencyId,
        title,
        description: input.description?.trim() ?? "",
        workspaceId: input.workspaceId ?? null,
        assigneeId: input.assigneeId ?? null,
        dueAt: input.dueAt ?? null,
        priority: input.priority ?? "normal",
        createdBy: actor.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!task) throw new Error("task.create_failed");
    await recordActivity(tx, {
      agencyId: input.agencyId,
      taskId: task.id,
      actorId: actor.id,
      kind: "created",
      summary: "Task created",
      afterData: { title: task.title, status: task.status, priority: task.priority },
    });
    return task;
  });
}

async function getRawTask(taskId: string, agencyId?: string) {
  const [task] = await db
    .select()
    .from(agencyTasks)
    .where(
      and(eq(agencyTasks.id, taskId), agencyId ? eq(agencyTasks.agencyId, agencyId) : undefined),
    )
    .limit(1);
  return task ?? null;
}

async function canManageTask(
  actor: Actor,
  task: { agencyId: string; createdBy: string; assigneeId: string | null },
) {
  if (await isAgencyAdmin(actor, task.agencyId)) return true;
  return actor.id === task.createdBy || actor.id === task.assigneeId;
}

export async function updateTask(actor: Actor, taskId: string, input: TaskUpdateInput) {
  const current = await getRawTask(taskId);
  if (!current || !(await isAgencyMember(actor, current.agencyId))) {
    throw new PermissionDeniedError("task.update");
  }
  const admin = await isAgencyAdmin(actor, current.agencyId);
  if (!(await canManageTask(actor, current))) throw new PermissionDeniedError("task.update");
  if (input.assigneeId !== undefined && !admin) throw new PermissionDeniedError("task.assign");
  if (input.workspaceId !== undefined && !admin) throw new PermissionDeniedError("task.workspace");
  await assertWorkspaceInAgency(current.agencyId, input.workspaceId);
  await assertUserInAgency(current.agencyId, input.assigneeId);
  if (input.title !== undefined) input.title = assertTitle(input.title);
  if (input.status && !canTransitionTaskStatus(current.status as TaskStatus, input.status)) {
    throw new Error("task.status_transition_invalid");
  }
  const nextStatus = input.status ?? (current.status as TaskStatus);
  const now = new Date();
  let nextStartedAt = current.startedAt;
  if ((nextStatus === "in_progress" || nextStatus === "done") && !nextStartedAt) {
    nextStartedAt = now;
  }
  const changed = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Record<string, unknown>;
  if (Object.keys(changed).length === 0) return current;
  const values: Partial<typeof agencyTasks.$inferInsert> = { updatedAt: now };
  if (input.title !== undefined) values.title = input.title;
  if (input.description !== undefined) values.description = input.description.trim();
  if (input.workspaceId !== undefined) values.workspaceId = input.workspaceId;
  if (input.assigneeId !== undefined) values.assigneeId = input.assigneeId;
  if (input.dueAt !== undefined) values.dueAt = input.dueAt;
  if (input.priority !== undefined) values.priority = input.priority;
  if (input.status !== undefined) values.status = input.status;
  values.startedAt = nextStartedAt;
  values.completedAt = nextStatus === "done" ? (current.completedAt ?? now) : null;
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(agencyTasks)
      .set(values)
      .where(eq(agencyTasks.id, taskId))
      .returning();
    if (!updated) throw new Error("task.update_failed");
    await recordActivity(tx, {
      agencyId: updated.agencyId,
      taskId,
      actorId: actor.id,
      kind: input.status && input.status !== current.status ? "status_changed" : "updated",
      summary:
        input.status && input.status !== current.status
          ? `Task moved to ${input.status}`
          : "Task updated",
      beforeData: {
        status: current.status,
        priority: current.priority,
        assigneeId: current.assigneeId,
        startedAt: current.startedAt,
        completedAt: current.completedAt,
      },
      afterData: {
        status: updated.status,
        priority: updated.priority,
        assigneeId: updated.assigneeId,
        startedAt: updated.startedAt,
        completedAt: updated.completedAt,
      },
    });
    return updated;
  });
}

export async function archiveTask(actor: Actor, taskId: string) {
  const current = await getRawTask(taskId);
  if (!current || !(await isAgencyAdmin(actor, current.agencyId))) {
    throw new PermissionDeniedError("task.archive");
  }
  const now = new Date();
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(agencyTasks)
      .set({ archivedAt: now, archivedBy: actor.id, updatedAt: now })
      .where(and(eq(agencyTasks.id, taskId), isNull(agencyTasks.archivedAt)))
      .returning();
    if (!updated) throw new Error("task.archive_failed");
    await recordActivity(tx, {
      agencyId: updated.agencyId,
      taskId,
      actorId: actor.id,
      kind: "archived",
      summary: "Task archived",
    });
    return updated;
  });
}

export async function restoreTask(actor: Actor, taskId: string) {
  const current = await getRawTask(taskId);
  if (!current || !(await isAgencyAdmin(actor, current.agencyId))) {
    throw new PermissionDeniedError("task.restore");
  }
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(agencyTasks)
      .set({ archivedAt: null, archivedBy: null, updatedAt: new Date() })
      .where(and(eq(agencyTasks.id, taskId), isNotNull(agencyTasks.archivedAt)))
      .returning();
    if (!updated) throw new Error("task.restore_failed");
    await recordActivity(tx, {
      agencyId: updated.agencyId,
      taskId,
      actorId: actor.id,
      kind: "restored",
      summary: "Task restored",
    });
    return updated;
  });
}

export async function listTasks(actor: Actor, options: TaskListOptions) {
  if (!(await isAgencyMember(actor, options.agencyId)))
    throw new PermissionDeniedError("task.list");
  const pageSize = Math.min(Math.max(options.pageSize ?? 20, 1), 100);
  const page = Math.max(options.page ?? 1, 1);
  const filters = [eq(agencyTasks.agencyId, options.agencyId), isNull(agencyTasks.archivedAt)];
  if (options.status) filters.push(eq(agencyTasks.status, options.status));
  if (options.priority) filters.push(eq(agencyTasks.priority, options.priority));
  if (options.workspaceId) filters.push(eq(agencyTasks.workspaceId, options.workspaceId));
  if (options.assigneeId) filters.push(eq(agencyTasks.assigneeId, options.assigneeId));
  if (options.mine)
    filters.push(or(eq(agencyTasks.assigneeId, actor.id), eq(agencyTasks.createdBy, actor.id))!);
  if (options.overdue)
    filters.push(
      sql`${agencyTasks.dueAt} < now() AND ${agencyTasks.status} NOT IN ('done', 'cancelled')`,
    );
  const search = options.search?.trim();
  if (search)
    filters.push(
      or(ilike(agencyTasks.title, `%${search}%`), ilike(agencyTasks.description, `%${search}%`))!,
    );
  const where = and(...filters);
  const [totalRow] = await db.select({ total: count() }).from(agencyTasks).where(where);
  const rows = await db
    .select({
      task: agencyTasks,
      assigneeName: users.displayName,
      workspaceName: workspaces.name,
      workspaceSlug: workspaces.slug,
    })
    .from(agencyTasks)
    .leftJoin(users, eq(users.id, agencyTasks.assigneeId))
    .leftJoin(workspaces, eq(workspaces.id, agencyTasks.workspaceId))
    .where(where)
    .orderBy(
      sql`CASE WHEN ${agencyTasks.status} = 'blocked' THEN 0 WHEN ${agencyTasks.dueAt} < now() THEN 1 ELSE 2 END`,
      asc(agencyTasks.dueAt),
      desc(agencyTasks.createdAt),
    )
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return {
    rows: rows.map((row) => ({
      ...row.task,
      assigneeName: row.assigneeName,
      workspaceName: row.workspaceName,
      workspaceSlug: row.workspaceSlug,
    })),
    total: Number(totalRow?.total ?? 0),
    page,
    pageSize,
  };
}

export async function getTaskDetail(actor: Actor, taskId: string) {
  const [row] = await db
    .select({
      task: agencyTasks,
      assigneeName: users.displayName,
      workspaceName: workspaces.name,
      workspaceSlug: workspaces.slug,
    })
    .from(agencyTasks)
    .leftJoin(users, eq(users.id, agencyTasks.assigneeId))
    .leftJoin(workspaces, eq(workspaces.id, agencyTasks.workspaceId))
    .where(eq(agencyTasks.id, taskId))
    .limit(1);
  if (!row || !(await isAgencyMember(actor, row.task.agencyId)))
    throw new PermissionDeniedError("task.view");
  const [events, attachments] = await Promise.all([
    db
      .select({ event: taskActivityEvents, actorName: users.displayName })
      .from(taskActivityEvents)
      .leftJoin(users, eq(users.id, taskActivityEvents.actorId))
      .where(eq(taskActivityEvents.taskId, taskId))
      .orderBy(desc(taskActivityEvents.createdAt))
      .limit(100),
    db
      .select()
      .from(taskAttachments)
      .where(and(eq(taskAttachments.taskId, taskId), eq(taskAttachments.status, "ready")))
      .orderBy(desc(taskAttachments.createdAt)),
  ]);
  return {
    ...row.task,
    assigneeName: row.assigneeName,
    workspaceName: row.workspaceName,
    workspaceSlug: row.workspaceSlug,
    canManage: await canManageTask(actor, row.task),
    canArchive: await isAgencyAdmin(actor, row.task.agencyId),
    canRestore: (await isAgencyAdmin(actor, row.task.agencyId)) && row.task.archivedAt !== null,
    events: events.map(({ event, actorName }) => ({ ...event, actorName })),
    attachments,
  };
}

export async function listAgencyMembers(agencyId: string) {
  return db
    .select({ id: users.id, name: users.displayName, email: users.email })
    .from(agencyMemberships)
    .innerJoin(users, eq(users.id, agencyMemberships.userId))
    .where(and(eq(agencyMemberships.agencyId, agencyId), eq(agencyMemberships.status, "active")))
    .orderBy(asc(users.displayName));
}

export async function listAgencyWorkspaces(agencyId: string) {
  return db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      timezone: workspaces.timezone,
    })
    .from(workspaces)
    .where(and(eq(workspaces.agencyId, agencyId), isNull(workspaces.archivedAt)))
    .orderBy(asc(workspaces.name));
}
