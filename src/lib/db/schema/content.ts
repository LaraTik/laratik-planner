import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { archivedAt, idColumn, jsonb, timestamps } from "./_helpers";
import { contentFormatEnum, contentStatusEnum, reviewGateEnum } from "./enums";
import { users } from "./identity";
import { workspaces } from "./workspaces";
import { campaigns, contentPillars } from "./planning";
import { socialChannels } from "./channels";

/**
 * STUDIOFLOW_MASTER_PROMPT.md §8 — Content production:
 * content_items, content_item_channels, content_assignments.
 *
 * Constraints from §8:
 * - blocked requires blocked_reason
 * - cancelled requires cancellation_reason
 * - changes_requested requires change_request_gate; every other status clears it
 * - partially_published and published are derived via the publishing service
 * - published cannot be entered until every active selected channel is published or skipped
 * - revision increments on material edits
 * - Every new item selects all active workspace channels by default
 *
 * These constraints are partially enforced in the DB (CHECK on blocked/cancelled)
 * and partially in the service layer (publishing-state derivation).
 */

// ─── content_items ────────────────────────────────────────────────────────
export const contentItems = pgTable(
  "content_item",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    contentPillarId: uuid("content_pillar_id").references(() => contentPillars.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    format: contentFormatEnum("format").notNull(),
    brief: text("brief").notNull().default(""),
    formatPayload: jsonb("format_payload"), // default { schemaVersion: 1 } enforced in service
    plannedPublishAt: timestamp("planned_publish_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    status: contentStatusEnum("status").notNull().default("draft"),
    statusReturnTarget: contentStatusEnum("status_return_target"),
    changeRequestGate: reviewGateEnum("change_request_gate"),
    priority: text("priority").notNull().default("normal"), // 'low' | 'normal' | 'high' | 'urgent'
    contentOwnerId: uuid("content_owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    designerId: uuid("designer_id").references(() => users.id, { onDelete: "set null" }),
    contentReviewerId: uuid("content_reviewer_id").references(() => users.id, {
      onDelete: "set null",
    }),
    internalCreativeReviewerId: uuid("internal_creative_reviewer_id").references(() => users.id, {
      onDelete: "set null",
    }),
    clientReviewerId: uuid("client_reviewer_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Foreign key to delivery_versions is added as a deferred FK in a later migration
    // (delivery_versions lives in deliveries.ts; we keep the column here for query convenience).
    approvedDeliveryVersionId: uuid("approved_delivery_version_id"),
    blockedReason: text("blocked_reason"),
    cancellationReason: text("cancellation_reason"),
    revision: integer("revision").notNull().default(0),
    archivedAt: archivedAt(),
    archivedBy: uuid("archived_by").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    // §8 required indexes
    index("content_item_workspace_planned_idx").on(t.workspaceId, t.plannedPublishAt),
    index("content_item_workspace_status_idx").on(t.workspaceId, t.status),
    index("content_item_designer_status_idx")
      .on(t.designerId, t.status)
      .where(sql`archived_at IS NULL`),
    index("content_item_owner_status_idx")
      .on(t.contentOwnerId, t.status)
      .where(sql`archived_at IS NULL`),
    // DB-level invariant enforcement (per §8 constraints)
    check(
      "content_item_blocked_needs_reason",
      sql`status <> 'blocked' OR blocked_reason IS NOT NULL`,
    ),
    check(
      "content_item_cancelled_needs_reason",
      sql`status <> 'cancelled' OR cancellation_reason IS NOT NULL`,
    ),
    check(
      "content_item_changes_requested_needs_gate",
      sql`status <> 'changes_requested' OR change_request_gate IS NOT NULL`,
    ),
    check(
      "content_item_other_statuses_no_gate",
      sql`status = 'changes_requested' OR change_request_gate IS NULL`,
    ),
    check("content_item_priority_valid", sql`priority IN ('low', 'normal', 'high', 'urgent')`),
  ],
);

// ─── content_item_channels ────────────────────────────────────────────────
// "Every new item selects all active workspace channels by default. Users
// may remove them. The effective schedule is the override or the item
// default." — The override is stored per-channel; the calendar query
// joins to content_item to compute the effective time at read time.
export const contentItemChannels = pgTable(
  "content_item_channel",
  {
    id: idColumn(),
    contentItemId: uuid("content_item_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    socialChannelId: uuid("social_channel_id")
      .notNull()
      .references(() => socialChannels.id, { onDelete: "restrict" }),
    plannedPublishAtOverride: timestamp("planned_publish_at_override", {
      withTimezone: true,
      mode: "date",
    }),
    caption: text("caption"),
    callToAction: text("call_to_action"),
    hashtags: text("hashtags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    // Content revision at which this channel last inherited/saved the
    // shared audience copy. A lower value marks a custom override stale.
    copySourceRevision: integer("copy_source_revision"),
    platformPayload: jsonb("platform_payload"),
    ...timestamps,
  },
  (t) => [
    // "unique content_item_id plus social_channel_id"
    uniqueIndex("cic_pk").on(t.contentItemId, t.socialChannelId),
    // "content_item_channels on social_channel_id and effective schedule support"
    // — Index the override (when set) + channel id. Calendar queries join to
    // content_item to pick up the default planned_publish_at.
    index("cic_channel_override_idx").on(t.socialChannelId, t.plannedPublishAtOverride),
  ],
);

// ─── content_assignments ──────────────────────────────────────────────────
// "Keep assignment history even though current IDs also exist on content_items
// for efficient reads."
export const contentAssignments = pgTable(
  "content_assignment",
  {
    id: idColumn(),
    contentItemId: uuid("content_item_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    assignmentType: text("assignment_type").notNull(),
    // 'owner' | 'designer' | 'content_reviewer' | 'internal_creative_reviewer' | 'client_reviewer' | 'publisher'
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    assignedBy: uuid("assigned_by").references(() => users.id, { onDelete: "set null" }),
    active: boolean("active").notNull().default(true),
    assignedAt: timestamp("assigned_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    releasedAt: timestamp("released_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [
    index("content_assignment_item_idx").on(t.contentItemId),
    index("content_assignment_user_idx").on(t.userId, t.active),
    check(
      "content_assignment_type_valid",
      sql`${t.assignmentType} IN ('owner', 'designer', 'content_reviewer', 'internal_creative_reviewer', 'client_reviewer', 'publisher')`,
    ),
  ],
);
