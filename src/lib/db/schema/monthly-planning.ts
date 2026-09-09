import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { idColumn, jsonb, jsonbArray, jsonbNullable, timestamps } from "./_helpers";
import { agencies, users } from "./identity";
import { workspaces } from "./workspaces";

/** Versioned planning context owned by a workspace. */
export const brandProfiles = pgTable("brand_profile", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull().default(1),
  profile: jsonb("profile"),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
});

export const brandProfileRevisions = pgTable(
  "brand_profile_revision",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    profile: jsonb("profile"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("brand_profile_revision_workspace_revision_idx").on(t.workspaceId, t.revision),
    index("brand_profile_revision_workspace_idx").on(t.workspaceId, t.createdAt),
  ],
);

/**
 * Modular AI planning instructions. Agency packs are reusable across
 * workspaces; workspace packs are scoped additions/overrides. Only the
 * published revision is eligible for context injection.
 */
export const planningInstructionPacks = pgTable(
  "planning_instruction_pack",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sourceMarkdown: text("source_markdown").notNull(),
    manifest: jsonb("manifest"),
    status: text("status").notNull().default("draft"),
    revision: integer("revision").notNull().default(1),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    index("planning_instruction_pack_agency_idx").on(t.agencyId, t.status),
    index("planning_instruction_pack_workspace_idx").on(t.workspaceId, t.status),
    check("planning_instruction_pack_status_valid", sql`${t.status} IN ('draft', 'published')`),
  ],
);

export const planningInstructionPackRevisions = pgTable(
  "planning_instruction_pack_revision",
  {
    id: idColumn(),
    packId: uuid("pack_id")
      .notNull()
      .references(() => planningInstructionPacks.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    sourceMarkdown: text("source_markdown").notNull(),
    manifest: jsonb("manifest"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("planning_instruction_pack_revision_pack_revision_idx").on(t.packId, t.revision),
    index("planning_instruction_pack_revision_pack_idx").on(t.packId, t.createdAt),
  ],
);

export const monthlyPlanningSessions = pgTable(
  "monthly_planning_session",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    status: text("status").notNull().default("discovery"),
    inputs: jsonb("inputs"),
    sourceRevision: text("source_revision").notNull().default("v1"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("monthly_planning_session_workspace_month_idx").on(t.workspaceId, t.month),
    index("monthly_planning_session_workspace_updated_idx").on(t.workspaceId, t.updatedAt),
    check(
      "monthly_planning_session_status_valid",
      sql`${t.status} IN ('discovery', 'strategy', 'execution', 'review', 'applied', 'archived')`,
    ),
    check("monthly_planning_session_month_valid", sql`${t.month} ~ '^[0-9]{4}-[0-9]{2}$'`),
  ],
);

export const monthlyPlanningMessages = pgTable(
  "monthly_planning_message",
  {
    id: idColumn(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => monthlyPlanningSessions.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    metadata: jsonbNullable("metadata"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("monthly_planning_message_session_idx").on(t.sessionId, t.createdAt),
    check("monthly_planning_message_role_valid", sql`${t.role} IN ('user', 'assistant', 'system')`),
  ],
);

export const planningProposals = pgTable(
  "planning_proposal",
  {
    id: idColumn(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => monthlyPlanningSessions.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    status: text("status").notNull().default("draft"),
    proposal: jsonb("proposal"),
    sourceRevision: text("source_revision").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    appliedContentIds: jsonbArray("applied_content_ids"),
    appliedAt: timestamp("applied_at", { withTimezone: true, mode: "date" }),
    appliedBy: uuid("applied_by").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("planning_proposal_session_revision_idx").on(t.sessionId, t.revision),
    uniqueIndex("planning_proposal_idempotency_idx").on(t.idempotencyKey),
    index("planning_proposal_session_status_idx").on(t.sessionId, t.status),
    check(
      "planning_proposal_status_valid",
      sql`${t.status} IN ('draft', 'approved', 'applying', 'applied', 'stale', 'rejected')`,
    ),
  ],
);
