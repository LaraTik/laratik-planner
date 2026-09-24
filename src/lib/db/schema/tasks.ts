import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { idColumn, jsonb, timestamps } from "./_helpers";
import { agencies, users } from "./identity";
import { workspaces } from "./workspaces";

/** Agency-wide operational tasks. A workspace is optional by design. */
export const agencyTasks = pgTable(
  "agency_task",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("backlog"),
    priority: text("priority").notNull().default("normal"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    dueAt: timestamp("due_at", { withTimezone: true, mode: "date" }),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    archivedBy: uuid("archived_by").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    index("agency_task_agency_status_due_idx").on(t.agencyId, t.status, t.dueAt),
    index("agency_task_agency_assignee_status_idx").on(t.agencyId, t.assigneeId, t.status),
    index("agency_task_workspace_due_idx").on(t.workspaceId, t.dueAt),
    index("agency_task_created_idx").on(t.agencyId, sql`${t.createdAt} DESC`),
    check("agency_task_title_not_empty", sql`length(trim(${t.title})) BETWEEN 1 AND 200`),
    check(
      "agency_task_status_valid",
      sql`${t.status} IN ('backlog', 'in_progress', 'blocked', 'in_review', 'done', 'cancelled')`,
    ),
    check("agency_task_priority_valid", sql`${t.priority} IN ('low', 'normal', 'high', 'urgent')`),
    check(
      "agency_task_done_has_completion",
      sql`${t.status} <> 'done' OR ${t.completedAt} IS NOT NULL`,
    ),
  ],
);

/** Append-only operational history for an agency task. */
export const taskActivityEvents = pgTable(
  "task_activity_event",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => agencyTasks.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    beforeData: jsonb("before_data"),
    afterData: jsonb("after_data"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("task_activity_task_created_idx").on(t.taskId, sql`${t.createdAt} DESC`),
    index("task_activity_agency_created_idx").on(t.agencyId, sql`${t.createdAt} DESC`),
  ],
);

/** Direct-to-provider files attached to an agency task. */
export const taskAttachments = pgTable(
  "task_attachment",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => agencyTasks.id, { onDelete: "cascade" }),
    bucket: text("bucket").notNull(),
    objectKey: text("object_key").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    status: text("status").notNull().default("pending"),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("task_attachment_task_created_idx").on(t.taskId, sql`${t.createdAt} DESC`),
    check("task_attachment_status_valid", sql`${t.status} IN ('pending', 'ready', 'failed')`),
  ],
);
