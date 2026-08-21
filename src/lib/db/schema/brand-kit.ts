import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { archivedAt, idColumn, timestamps } from "./_helpers";
import { users } from "./identity";
import { workspaces } from "./workspaces";

/**
 * STUDIOFLOW_MASTER_PROMPT.md §8 (brand kit extension) — two additive
 * tables for the Stitch production completion program (Goal 5, Task 2):
 *
 * - `brand_publishing_rule` — workspace-scoped editorial guardrails
 *   (alt-text conventions, hashtag norms, compliance reminders,
 *   per-channel guidance, general notes). Soft-archived via
 *   `archived_at`.
 * - `brand_linked_resource` — links out to external design / asset
 *   libraries (Google Drive, Figma, Canva, Dropbox, etc). URL must be
 *   HTTPS to discourage cleartext and to match the social-channel
 *   invariant.
 *
 * Both tables are additive: they add new rows only, never modify
 * existing columns. Forward compatibility: a pre-migration application
 * image continues to function because no existing query references
 * either table.
 */

export const brandPublishingRules = pgTable(
  "brand_publishing_rule",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    ruleType: text("rule_type").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: archivedAt(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [
    index("brand_publishing_rule_workspace_idx").on(table.workspaceId, table.sortOrder),
    check(
      "brand_publishing_rule_type_valid",
      sql`${table.ruleType} IN ('alt_text', 'hashtag', 'compliance', 'channel', 'general')`,
    ),
  ],
);

export const brandLinkedResources = pgTable(
  "brand_linked_resource",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    description: text("description"),
    archivedAt: archivedAt(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [
    index("brand_linked_resource_workspace_idx").on(table.workspaceId),
    check(
      "brand_linked_resource_provider_valid",
      sql`${table.provider} IN ('google_drive', 'figma', 'canva', 'dropbox', 'other')`,
    ),
    check("brand_linked_resource_url_https", sql`${table.url} ~* '^https://'`),
  ],
);
