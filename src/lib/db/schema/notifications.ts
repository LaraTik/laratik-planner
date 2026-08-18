import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { idColumn, jsonb } from "./_helpers";
import { notificationKindEnum } from "./enums";
import { users } from "./identity";
import { contentItems } from "./content";
import { workspaces } from "./workspaces";

/**
 * STUDIOFLOW_MASTER_PROMPT.md §8 — Notifications, outbox, activity.
 *
 * "Invitations and security events cannot be disabled. Important approval
 * and assignment email defaults may be enabled but remain user-configurable."
 * — Enforced at the service layer (Goal 8); the `notification_preferences`
 * table simply records the user choice.
 *
 * "Create outbox events in the same transaction as the business change. A
 * scheduled worker delivers notifications and email idempotently." — The
 * outbox pattern is the heart of Goal 8.
 */

// ─── notifications ────────────────────────────────────────────────────────
export const notifications = pgTable(
  "notification",
  {
    id: idColumn(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    contentItemId: uuid("content_item_id").references(() => contentItems.id, {
      onDelete: "cascade",
    }),
    kind: notificationKindEnum("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    actionUrl: text("action_url"),
    readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("notification_user_read_created_idx").on(t.userId, t.readAt, sql`${t.createdAt} DESC`),
    index("notification_workspace_idx").on(t.workspaceId, sql`${t.createdAt} DESC`),
  ],
);

// ─── notification_preferences ─────────────────────────────────────────────
export const notificationPreferences = pgTable(
  "notification_preference",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: notificationKindEnum("kind").notNull(),
    inAppEnabled: boolean("in_app_enabled").notNull().default(true),
    emailEnabled: boolean("email_enabled").notNull().default(false),
    digestEnabled: boolean("digest_enabled").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind] })],
);

// ─── outbox_events ────────────────────────────────────────────────────────
export const outboxEvents = pgTable(
  "outbox_event",
  {
    id: idColumn(),
    eventType: text("event_type").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    payload: jsonb("payload"),
    availableAt: timestamp("available_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    // "outbox_events on processed_at plus available_at where processed_at is null"
    index("outbox_unprocessed_idx")
      .on(t.availableAt)
      .where(sql`processed_at IS NULL`),
  ],
);

// ─── activity_events ──────────────────────────────────────────────────────
export const activityEvents = pgTable(
  "activity_event",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contentItemId: uuid("content_item_id").references(() => contentItems.id, {
      onDelete: "set null",
    }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind").notNull(), // activity_kind enum reused via text
    summary: text("summary").notNull(),
    beforeData: jsonb("before_data"),
    afterData: jsonb("after_data"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("activity_event_workspace_created_idx").on(t.workspaceId, sql`${t.createdAt} DESC`),
    index("activity_event_content_item_idx").on(t.contentItemId),
  ],
);
