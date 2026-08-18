import { sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { idColumn, jsonb, timestamps } from "./_helpers";
import { users } from "./identity";
import { agencies } from "./identity";
import { workspaces } from "./workspaces";
import { contentItems } from "./content";

/**
 * STUDIOFLOW_MASTER_PROMPT.md §8 — AI feature settings + usage events.
 *
 * "Do not store the plaintext API key in this table." — Only the
 * `masked_key_suffix` (last 4 chars) is allowed; the real key lives in
 * the env var. Enforced at the service layer.
 *
 * "The context manifest records categories used, not raw private content."
 * — The `context_manifest` jsonb is intentionally generic; service code
 * never puts raw message bodies or briefs into it.
 */

export const aiFeatureSettings = pgTable("ai_feature_setting", {
  agencyId: uuid("agency_id")
    .primaryKey()
    .references(() => agencies.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  model: text("model").notNull().default("MiniMax-M3"),
  enabledCapabilities: text("enabled_capabilities")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  keySource: text("key_source").notNull().default("environment"), // 'environment' | 'managed_secret'
  maskedKeySuffix: text("masked_key_suffix"),
  lastConnectionTestAt: timestamp("last_connection_test_at", {
    withTimezone: true,
    mode: "date",
  }),
  lastConnectionTestOk: boolean("last_connection_test_ok"),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
});

export const aiUsageEvents = pgTable(
  "ai_usage_event",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contentItemId: uuid("content_item_id").references(() => contentItems.id, {
      onDelete: "set null",
    }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    capability: text("capability").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    contextManifest: jsonb("context_manifest"),
    requestId: text("request_id").notNull(),
    succeeded: boolean("succeeded").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("ai_usage_workspace_idx").on(t.workspaceId, sql`${t.createdAt} DESC`),
    index("ai_usage_agency_idx").on(t.agencyId, sql`${t.createdAt} DESC`),
    index("ai_usage_user_idx").on(t.userId, sql`${t.createdAt} DESC`),
  ],
);
