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
import { idColumn, jsonb, timestamps } from "./_helpers";
import { agencies, users } from "./identity";

/** Agency-owned skill identity and the currently approved revision pointer. */
export const workspaceAssistantSkills = pgTable(
  "workspace_assistant_skill",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    latestRevision: integer("latest_revision").notNull().default(1),
    activeRevision: integer("active_revision"),
    status: text("status").notNull().default("draft"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("workspace_assistant_skill_agency_slug_idx").on(t.agencyId, t.slug),
    index("workspace_assistant_skill_agency_status_idx").on(t.agencyId, t.status),
    check("workspace_assistant_skill_slug_valid", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check(
      "workspace_assistant_skill_status_valid",
      sql`${t.status} IN ('draft', 'pending_review', 'active', 'archived')`,
    ),
    check("workspace_assistant_skill_revision_valid", sql`${t.latestRevision} > 0`),
    check(
      "workspace_assistant_skill_active_revision_valid",
      sql`${t.activeRevision} IS NULL OR ${t.activeRevision} > 0`,
    ),
  ],
);

/** Immutable skill snapshots; a reviewer distinct from the author activates them. */
export const workspaceAssistantSkillRevisions = pgTable(
  "workspace_assistant_skill_revision",
  {
    id: idColumn(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => workspaceAssistantSkills.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    snapshot: jsonb("snapshot"),
    state: text("state").notNull().default("draft"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
    reviewNote: text("review_note"),
    rollbackOfRevision: integer("rollback_of_revision"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("workspace_assistant_skill_revision_identity_idx").on(t.skillId, t.revision),
    index("workspace_assistant_skill_revision_state_idx").on(t.skillId, t.state),
    check("workspace_assistant_skill_revision_number_valid", sql`${t.revision} > 0`),
    check(
      "workspace_assistant_skill_revision_rollback_target_valid",
      sql`${t.rollbackOfRevision} IS NULL OR ${t.rollbackOfRevision} > 0`,
    ),
    check(
      "workspace_assistant_skill_revision_state_valid",
      sql`${t.state} IN ('draft', 'pending_review', 'approved', 'rejected')`,
    ),
    check(
      "workspace_assistant_skill_revision_reviewer_valid",
      sql`${t.state} NOT IN ('approved', 'rejected') OR (${t.reviewedBy} IS NOT NULL AND ${t.reviewedAt} IS NOT NULL)`,
    ),
  ],
);
