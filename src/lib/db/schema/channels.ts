import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { archivedAt, idColumn, jsonb, timestamps } from "./_helpers";
import { socialPlatformEnum } from "./enums";
import { users } from "./identity";
import { workspaces } from "./workspaces";

/**
 * STUDIOFLOW_MASTER_PROMPT.md §8 — Workspace configuration:
 * social_channels, brand_assets, brand_voice_rules.
 *
 * URLs must use https except approved local test values.
 * Channels are informational in v1 (no metrics collection).
 */

// ─── social_channels ──────────────────────────────────────────────────────
export const socialChannels = pgTable(
  "social_channel",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    platform: socialPlatformEnum("platform").notNull(),
    accountName: text("account_name").notNull(),
    handle: text("handle"),
    url: text("url"),
    accountType: text("account_type"),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    archivedAt: archivedAt(),
    archivedBy: uuid("archived_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("social_channel_workspace_idx").on(t.workspaceId),
    index("social_channel_workspace_active_idx")
      .on(t.workspaceId)
      .where(sql`archived_at IS NULL`),
    check("social_channel_url_https", sql`${t.url} IS NULL OR ${t.url} ~* '^https?://'`),
  ],
);

// ─── brand_assets ──────────────────────────────────────────────────────────
export const brandAssets = pgTable(
  "brand_asset",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(), // 'logo' | 'color' | 'font' | 'guideline' | 'reference' | 'other'
    name: text("name").notNull(),
    value: jsonb("value"),
    storagePath: text("storage_path"),
    externalUrl: text("external_url"),
    archivedAt: archivedAt(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    index("brand_asset_workspace_idx").on(t.workspaceId),
    check(
      "brand_asset_kind_valid",
      sql`${t.kind} IN ('logo', 'color', 'font', 'guideline', 'reference', 'other')`,
    ),
  ],
);

// ─── brand_voice_rules ────────────────────────────────────────────────────
//
// Soft-archive support added in the Brand Kit polish round
// (commit "fix(brand-kit): undoable archive + empty states +
// recent-updates user join"). Migration 0006 adds the `archived_at`
// column so voice rules can be restored from the undo toast instead
// of being hard-deleted — same lifecycle as `brand_asset`,
// `brand_publishing_rule`, and `brand_linked_resource`.
export const brandVoiceRules = pgTable(
  "brand_voice_rule",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    ruleType: text("rule_type").notNull(), // 'tone' | 'do' | 'dont'
    content: text("content").notNull(),
    sortOrder: text("sort_order").notNull().default("0"), // string for sortable insertion
    archivedAt: archivedAt(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    index("brand_voice_workspace_idx").on(t.workspaceId, t.sortOrder),
    check("brand_voice_type_valid", sql`${t.ruleType} IN ('tone', 'do', 'dont')`),
  ],
);
