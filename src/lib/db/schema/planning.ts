import { sql } from "drizzle-orm";
import { check, date, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { archivedAt, idColumn, jsonb, timestamps } from "./_helpers";
import { contentFormatEnum } from "./enums";
import { users } from "./identity";
import { workspaces } from "./workspaces";

/**
 * STUDIOFLOW_MASTER_PROMPT.md §8 — Planning library:
 * campaigns, content_pillars, content_templates.
 *
 * "Validate format_payload and relative_schedule_rule with versioned Zod
 * schemas before write." — enforced at the service layer (Goal 5+).
 */

// ─── campaigns ────────────────────────────────────────────────────────────
export const campaigns = pgTable(
  "campaign",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    objective: text("objective"),
    description: text("description"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    coverColor: text("cover_color"),
    status: text("status").notNull().default("draft"), // 'draft' | 'active' | 'completed' | 'archived'
    archivedAt: archivedAt(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    index("campaign_workspace_idx").on(t.workspaceId, t.status),
    check(
      "campaign_status_valid",
      sql`${t.status} IN ('draft', 'active', 'completed', 'archived')`,
    ),
  ],
);

// ─── content_pillars ──────────────────────────────────────────────────────
export const contentPillars = pgTable(
  "content_pillar",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    color: text("color"),
    description: text("description"),
    archivedAt: archivedAt(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    // "unique active name per workspace using a partial unique index"
    uniqueIndex("pillar_active_name_unique")
      .on(t.workspaceId, sql`lower(${t.name})`)
      .where(sql`archived_at IS NULL`),
    index("pillar_workspace_idx").on(t.workspaceId),
  ],
);

// ─── content_templates ────────────────────────────────────────────────────
export const contentTemplates = pgTable(
  "content_template",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    format: contentFormatEnum("format").notNull(),
    defaultChannelIds: text("default_channel_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    contentPillarId: uuid("content_pillar_id").references(() => contentPillars.id, {
      onDelete: "set null",
    }),
    briefTemplate: text("brief_template"),
    formatPayload: jsonb("format_payload"),
    defaultDesignerId: uuid("default_designer_id").references(() => users.id, {
      onDelete: "set null",
    }),
    defaultReviewerId: uuid("default_reviewer_id").references(() => users.id, {
      onDelete: "set null",
    }),
    relativeScheduleRule: jsonb("relative_schedule_rule"),
    archivedAt: archivedAt(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("template_active_name_unique")
      .on(t.workspaceId, sql`lower(${t.name})`)
      .where(sql`archived_at IS NULL`),
    index("template_workspace_idx").on(t.workspaceId),
  ],
);
