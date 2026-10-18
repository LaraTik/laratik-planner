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
import { idColumn, jsonb, timestamps } from "./_helpers";
import { users } from "./identity";
import { workspaces } from "./workspaces";
import { socialChannels } from "./channels";
import { socialConnections } from "./social-analytics";

/**
 * Workspace-scoped Community & Inbox persistence. Provider payloads are kept
 * in metadata for forward compatibility, while user-facing message text and
 * delivery state remain normalized and queryable.
 */
export const communityConversations = pgTable(
  "community_conversation",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    socialChannelId: uuid("social_channel_id").references(() => socialChannels.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull().default("meta"),
    channelType: text("channel_type").notNull(),
    externalConversationId: text("external_conversation_id").notNull(),
    externalRootId: text("external_root_id"),
    externalPostId: text("external_post_id"),
    state: text("state").notNull().default("new"),
    priority: text("priority").notNull().default("normal"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true, mode: "date" }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true, mode: "date" }),
    metadata: jsonb("metadata"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("community_conversation_provider_external_unique").on(
      t.workspaceId,
      t.provider,
      t.externalConversationId,
    ),
    index("community_conversation_workspace_state_idx").on(t.workspaceId, t.state, t.updatedAt),
    index("community_conversation_workspace_last_message_idx").on(
      t.workspaceId,
      sql`${t.lastMessageAt} DESC`,
    ),
    check(
      "community_conversation_state_valid",
      sql`${t.state} IN ('new', 'open', 'assigned', 'waiting_customer', 'waiting_approval', 'resolved', 'reopened', 'spam')`,
    ),
    check(
      "community_conversation_priority_valid",
      sql`${t.priority} IN ('low', 'normal', 'high', 'urgent')`,
    ),
  ],
);

export const communityMessages = pgTable(
  "community_message",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => communityConversations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("meta"),
    externalMessageId: text("external_message_id").notNull(),
    direction: text("direction").notNull(),
    visibility: text("visibility").notNull().default("public"),
    body: text("body").notNull(),
    authorName: text("author_name"),
    authorExternalId: text("author_external_id"),
    externalParentId: text("external_parent_id"),
    deliveryState: text("delivery_state").notNull().default("received"),
    postedAt: timestamp("posted_at", { withTimezone: true, mode: "date" }).notNull(),
    metadata: jsonb("metadata"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("community_message_provider_external_unique").on(
      t.workspaceId,
      t.provider,
      t.externalMessageId,
    ),
    index("community_message_conversation_posted_idx").on(t.conversationId, t.postedAt),
    check(
      "community_message_direction_valid",
      sql`${t.direction} IN ('incoming', 'outgoing', 'note')`,
    ),
    check(
      "community_message_visibility_valid",
      sql`${t.visibility} IN ('public', 'private', 'internal')`,
    ),
    check(
      "community_message_delivery_state_valid",
      sql`${t.deliveryState} IN ('received', 'draft', 'queued', 'sending', 'sent', 'failed', 'unknown', 'reconciled')`,
    ),
  ],
);

export const communityCapabilities = pgTable(
  "community_capability",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    socialConnectionId: uuid("social_connection_id")
      .notNull()
      .references(() => socialConnections.id, { onDelete: "cascade" }),
    operation: text("operation").notNull(),
    state: text("state").notNull().default("unknown"),
    providerVersion: text("provider_version"),
    checkedAt: timestamp("checked_at", { withTimezone: true, mode: "date" }),
    detail: text("detail"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("community_capability_connection_operation_unique").on(
      t.socialConnectionId,
      t.operation,
    ),
    index("community_capability_workspace_idx").on(t.workspaceId, t.state),
    check(
      "community_capability_state_valid",
      sql`${t.state} IN ('available', 'unavailable', 'unknown')`,
    ),
  ],
);

export const communitySyncStates = pgTable(
  "community_sync_state",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    socialConnectionId: uuid("social_connection_id")
      .notNull()
      .references(() => socialConnections.id, { onDelete: "cascade" }),
    syncKind: text("sync_kind").notNull().default("comments"),
    cursor: text("cursor"),
    status: text("status").notNull().default("idle"),
    lastStartedAt: timestamp("last_started_at", { withTimezone: true, mode: "date" }),
    lastCompletedAt: timestamp("last_completed_at", { withTimezone: true, mode: "date" }),
    lastErrorCode: text("last_error_code"),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("community_sync_state_connection_kind_unique").on(t.socialConnectionId, t.syncKind),
    index("community_sync_state_workspace_idx").on(t.workspaceId, t.status, t.syncKind),
    check(
      "community_sync_state_kind_valid",
      sql`${t.syncKind} IN ('comments', 'private_messages')`,
    ),
    check(
      "community_sync_state_status_valid",
      sql`${t.status} IN ('idle', 'running', 'failed', 'paused')`,
    ),
  ],
);

export const communityDrafts = pgTable(
  "community_draft",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => communityConversations.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    state: text("state").notNull().default("draft"),
    explanation: jsonb("explanation"),
    revision: integer("revision").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index("community_draft_conversation_idx").on(t.conversationId, t.revision),
    check(
      "community_draft_state_valid",
      sql`${t.state} IN ('draft', 'queued', 'approved', 'rejected', 'sent')`,
    ),
  ],
);

export const communitySendAttempts = pgTable(
  "community_send_attempt",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => communityConversations.id, { onDelete: "cascade" }),
    draftId: uuid("draft_id").references(() => communityDrafts.id, { onDelete: "set null" }),
    operation: text("operation").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    state: text("state").notNull().default("queued"),
    providerRequestId: text("provider_request_id"),
    errorCode: text("error_code"),
    errorDetail: text("error_detail"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true, mode: "date" }),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("community_send_attempt_idempotency_unique").on(t.workspaceId, t.idempotencyKey),
    index("community_send_attempt_workspace_state_idx").on(t.workspaceId, t.state, t.createdAt),
    check(
      "community_send_attempt_state_valid",
      sql`${t.state} IN ('queued', 'sending', 'sent', 'failed', 'unknown', 'reconciled')`,
    ),
  ],
);

export const communityEvents = pgTable(
  "community_event",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => communityConversations.id, {
      onDelete: "set null",
    }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    detail: text("detail").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("community_event_workspace_created_idx").on(t.workspaceId, sql`${t.createdAt} DESC`),
  ],
);

export const communityPlaybooks = pgTable(
  "community_playbook",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status").notNull().default("draft"),
    body: jsonb("body"),
    revision: integer("revision").notNull().default(1),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("community_playbook_workspace_status_idx").on(t.workspaceId, t.status),
    check(
      "community_playbook_status_valid",
      sql`${t.status} IN ('draft', 'published', 'archived')`,
    ),
  ],
);

export const communityAutomationRules = pgTable(
  "community_automation_rule",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    mode: text("mode").notNull().default("manual"),
    status: text("status").notNull().default("draft"),
    config: jsonb("config"),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (t) => [
    index("community_automation_rule_workspace_status_idx").on(t.workspaceId, t.status),
    check(
      "community_automation_rule_mode_valid",
      sql`${t.mode} IN ('manual', 'ai_assist', 'controlled_auto')`,
    ),
    check(
      "community_automation_rule_status_valid",
      sql`${t.status} IN ('draft', 'tested', 'published', 'paused', 'archived')`,
    ),
  ],
);

export const communityTestCases = pgTable(
  "community_test_case",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    input: jsonb("input"),
    expected: jsonb("expected"),
    lastRunAt: timestamp("last_run_at", { withTimezone: true, mode: "date" }),
    lastPassed: boolean("last_passed"),
    ...timestamps,
  },
  (t) => [index("community_test_case_workspace_idx").on(t.workspaceId, t.updatedAt)],
);

export const communityRoutingRules = pgTable(
  "community_routing_rule",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    priority: integer("priority").notNull().default(100),
    enabled: boolean("enabled").notNull().default(true),
    conditions: jsonb("conditions"),
    actions: jsonb("actions"),
    ...timestamps,
  },
  (t) => [index("community_routing_rule_workspace_priority_idx").on(t.workspaceId, t.priority)],
);
