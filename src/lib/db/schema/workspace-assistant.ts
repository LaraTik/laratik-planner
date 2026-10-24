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
  jsonb as drizzleJsonb,
} from "drizzle-orm/pg-core";
import { archivedAt, idColumn, jsonb, jsonbArray, jsonbNullable, timestamps } from "./_helpers";
import { agencies, users } from "./identity";
import { workspaces } from "./workspaces";
import { contentItems } from "./content";

/** Private session metadata; transcript text is retained only in browser memory. */
export const workspaceAssistantConversations = pgTable(
  "workspace_assistant_conversation",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New conversation"),
    mode: text("mode").notNull().default("ask"),
    archivedAt: archivedAt(),
    ...timestamps,
  },
  (t) => [
    index("workspace_assistant_conversation_owner_idx").on(t.workspaceId, t.ownerId, t.updatedAt),
    check(
      "workspace_assistant_conversation_title_valid",
      sql`length(trim(${t.title})) BETWEEN 1 AND 160`,
    ),
    check(
      "workspace_assistant_conversation_mode_valid",
      sql`${t.mode} IN ('ask', 'plan', 'apply')`,
    ),
  ],
);

/** Legacy transcript table retained for migration compatibility; runtime never reads or writes it. */
export const workspaceAssistantMessages = pgTable(
  "workspace_assistant_message",
  {
    id: idColumn(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => workspaceAssistantConversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    metadata: jsonbNullable("metadata"),
    ...timestamps,
  },
  (t) => [
    index("workspace_assistant_message_conversation_created_idx").on(t.conversationId, t.createdAt),
    check("workspace_assistant_message_role_valid", sql`${t.role} IN ('user', 'assistant')`),
    check(
      "workspace_assistant_message_content_length",
      sql`length(${t.content}) BETWEEN 1 AND 12000`,
    ),
  ],
);

/** Immutable, expiring edit previews; application state is actor and workspace bound. */
export const workspaceAssistantProposals = pgTable(
  "workspace_assistant_proposal",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => workspaceAssistantConversations.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    contentItemId: uuid("content_item_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    expectedRevision: integer("expected_revision").notNull(),
    field: text("field").notNull(),
    title: text("title").notNull(),
    beforeValue: text("before_value").notNull(),
    afterValue: text("after_value").notNull(),
    evidenceIds: jsonbArray("evidence_ids"),
    status: text("status").notNull().default("proposed"),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true, mode: "date" }),
    appliedAt: timestamp("applied_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (t) => [
    index("workspace_assistant_proposal_owner_idx").on(t.workspaceId, t.ownerId, t.createdAt),
    index("workspace_assistant_proposal_conversation_idx").on(t.conversationId, t.createdAt),
    check(
      "workspace_assistant_proposal_field_valid",
      sql`${t.field} IN ('title', 'brief', 'plannedPublishAt')`,
    ),
    check(
      "workspace_assistant_proposal_status_valid",
      sql`${t.status} IN ('proposed', 'applied', 'rejected', 'stale', 'expired')`,
    ),
    check("workspace_assistant_proposal_revision_valid", sql`${t.expectedRevision} >= 0`),
    check(
      "workspace_assistant_proposal_title_valid",
      sql`length(trim(${t.title})) BETWEEN 1 AND 180`,
    ),
    check(
      "workspace_assistant_proposal_values_valid",
      sql`length(${t.beforeValue}) <= 2000 AND length(${t.afterValue}) BETWEEN 1 AND 2000`,
    ),
  ],
);

/** Reusable prompts; instructions are shared while data access remains actor-scoped. */
export const workspaceAssistantPrompts = pgTable(
  "workspace_assistant_prompt",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scope: text("scope").notNull().default("private"),
    status: text("status").notNull().default("draft"),
    name: text("name").notNull(),
    purpose: text("purpose").notNull(),
    goal: text("goal").notNull(),
    instructions: text("instructions").notNull(),
    tags: jsonbArray("tags"),
    parameters: drizzleJsonb("parameters")
      .notNull()
      .default(sql`'[]'::jsonb`),
    allowedContext: jsonb("allowed_context"),
    outputContract: jsonb("output_contract"),
    revision: integer("revision").notNull().default(1),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true, mode: "date" }),
    archivedAt: archivedAt(),
    ...timestamps,
  },
  (t) => [
    index("workspace_assistant_prompt_agency_idx").on(t.agencyId, t.scope, t.status),
    index("workspace_assistant_prompt_workspace_idx").on(t.workspaceId, t.scope, t.status),
    index("workspace_assistant_prompt_owner_idx").on(t.ownerId, t.workspaceId, t.updatedAt),
    check(
      "workspace_assistant_prompt_scope_valid",
      sql`${t.scope} IN ('private', 'workspace', 'agency')`,
    ),
    check(
      "workspace_assistant_prompt_status_valid",
      sql`${t.status} IN ('draft', 'pending_approval', 'published', 'archived')`,
    ),
    check(
      "workspace_assistant_prompt_scope_workspace_valid",
      sql`(${t.scope} = 'agency' AND ${t.workspaceId} IS NULL) OR (${t.scope} IN ('private', 'workspace') AND ${t.workspaceId} IS NOT NULL)`,
    ),
    check("workspace_assistant_prompt_name_valid", sql`length(trim(${t.name})) BETWEEN 2 AND 120`),
    check(
      "workspace_assistant_prompt_purpose_valid",
      sql`length(trim(${t.purpose})) BETWEEN 1 AND 500`,
    ),
    check("workspace_assistant_prompt_goal_valid", sql`length(trim(${t.goal})) BETWEEN 1 AND 1000`),
    check(
      "workspace_assistant_prompt_instructions_valid",
      sql`length(trim(${t.instructions})) BETWEEN 1 AND 12000`,
    ),
    check(
      "workspace_assistant_prompt_parameters_array",
      sql`jsonb_typeof(${t.parameters}) = 'array'`,
    ),
  ],
);

/** Immutable revisions for audit and rollback of shared prompt instructions. */
export const workspaceAssistantPromptRevisions = pgTable(
  "workspace_assistant_prompt_revision",
  {
    id: idColumn(),
    promptId: uuid("prompt_id")
      .notNull()
      .references(() => workspaceAssistantPrompts.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    snapshot: jsonb("snapshot"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("workspace_assistant_prompt_revision_identity_idx").on(t.promptId, t.revision),
    index("workspace_assistant_prompt_revision_prompt_idx").on(t.promptId, t.createdAt),
    check("workspace_assistant_prompt_revision_valid", sql`${t.revision} > 0`),
  ],
);

/** Verified, scoped facts available to the assistant through bounded retrieval. */
export const workspaceAssistantKnowledge = pgTable(
  "workspace_assistant_knowledge",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    scope: text("scope").notNull(),
    category: text("category").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    tags: jsonbArray("tags"),
    sourceUrl: text("source_url"),
    verificationStatus: text("verification_status").notNull().default("unverified"),
    verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
    revision: integer("revision").notNull().default(1),
    archivedAt: archivedAt(),
    ...timestamps,
  },
  (t) => [
    index("workspace_assistant_knowledge_agency_scope_idx").on(
      t.agencyId,
      t.scope,
      t.verificationStatus,
      t.updatedAt,
    ),
    index("workspace_assistant_knowledge_workspace_idx").on(
      t.workspaceId,
      t.verificationStatus,
      t.updatedAt,
    ),
    check("workspace_assistant_knowledge_scope_valid", sql`${t.scope} IN ('agency', 'workspace')`),
    check(
      "workspace_assistant_knowledge_scope_workspace_valid",
      sql`(${t.scope} = 'agency' AND ${t.workspaceId} IS NULL) OR (${t.scope} = 'workspace' AND ${t.workspaceId} IS NOT NULL)`,
    ),
    check(
      "workspace_assistant_knowledge_category_valid",
      sql`${t.category} IN ('brand', 'audience', 'strategy', 'operations', 'performance', 'reference')`,
    ),
    check(
      "workspace_assistant_knowledge_verification_valid",
      sql`${t.verificationStatus} IN ('unverified', 'verified', 'outdated')`,
    ),
    check(
      "workspace_assistant_knowledge_title_valid",
      sql`length(trim(${t.title})) BETWEEN 2 AND 160`,
    ),
    check(
      "workspace_assistant_knowledge_content_valid",
      sql`length(trim(${t.content})) BETWEEN 1 AND 8000`,
    ),
    check("workspace_assistant_knowledge_revision_valid", sql`${t.revision} > 0`),
    check(
      "workspace_assistant_knowledge_url_valid",
      sql`${t.sourceUrl} IS NULL OR ${t.sourceUrl} ~ '^https?://'`,
    ),
  ],
);

/** Immutable snapshots provide source provenance and revision comparison. */
export const workspaceAssistantKnowledgeRevisions = pgTable(
  "workspace_assistant_knowledge_revision",
  {
    id: idColumn(),
    knowledgeId: uuid("knowledge_id")
      .notNull()
      .references(() => workspaceAssistantKnowledge.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    snapshot: drizzleJsonb("snapshot").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("workspace_assistant_knowledge_revision_identity_idx").on(
      t.knowledgeId,
      t.revision,
    ),
    index("workspace_assistant_knowledge_revision_created_idx").on(t.knowledgeId, t.createdAt),
    check("workspace_assistant_knowledge_revision_valid", sql`${t.revision} > 0`),
  ],
);

/** Durable operational state for one assistant request; never stores prompt or response text. */
export const workspaceAssistantRuns = pgTable(
  "workspace_assistant_run",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => workspaceAssistantConversations.id, {
      onDelete: "set null",
    }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("running"),
    lastSequence: integer("last_sequence").notNull().default(0),
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true, mode: "date" }),
    terminalAt: timestamp("terminal_at", { withTimezone: true, mode: "date" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    ...timestamps,
  },
  (t) => [
    index("workspace_assistant_run_owner_idx").on(t.workspaceId, t.ownerId, t.createdAt),
    index("workspace_assistant_run_expiry_idx").on(t.expiresAt),
    check(
      "workspace_assistant_run_status_valid",
      sql`${t.status} IN ('running', 'completed', 'failed', 'cancelled')`,
    ),
    check("workspace_assistant_run_sequence_valid", sql`${t.lastSequence} BETWEEN 0 AND 64`),
  ],
);

/** Sanitized, replayable activity only; generated text and user input are excluded. */
export const workspaceAssistantRunEvents = pgTable(
  "workspace_assistant_run_event",
  {
    id: idColumn(),
    runId: uuid("run_id")
      .notNull()
      .references(() => workspaceAssistantRuns.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull(),
    detail: drizzleJsonb("detail").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("workspace_assistant_run_event_sequence_idx").on(t.runId, t.sequence),
    index("workspace_assistant_run_event_created_idx").on(t.runId, t.createdAt),
    check("workspace_assistant_run_event_sequence_valid", sql`${t.sequence} BETWEEN 1 AND 64`),
    check(
      "workspace_assistant_run_event_type_valid",
      sql`${t.type} IN ('run_started', 'context_resolved', 'skills_selected', 'plan_analyzed', 'provider_started', 'tool_started', 'tool_completed', 'tool_failed', 'response_validated', 'run_completed', 'run_failed', 'run_cancelled')`,
    ),
    check(
      "workspace_assistant_run_event_detail_size_valid",
      sql`octet_length(${t.detail}::text) <= 4096`,
    ),
  ],
);
