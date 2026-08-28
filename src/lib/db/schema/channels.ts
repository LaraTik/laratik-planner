import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
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
 *
 * M4 (M4 — social profile analytics) extends `social_channel` with
 * provider linkage and sync bookkeeping. Every new column is nullable
 * so the additive migration `0013_social_profile_analytics` is
 * backward-compatible. Existing manual channels pass the new
 * `connection_status` check constraint because the column default is
 * `'manual'`, which is in the allowed set. See ADR-0004.
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
    // M4 — provider linkage. `social_connection_id` is declared in the
    // SQL migration as a real FK; Drizzle's `references()` here is
    // structural metadata for joins. The actual FK is added by
    // `ALTER TABLE ... ADD CONSTRAINT` in the migration.
    socialConnectionId: uuid("social_connection_id"),
    externalAccountId: text("external_account_id"),
    avatarUrl: text("avatar_url"),
    connectionStatus: text("connection_status").notNull().default("manual"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true, mode: "date" }),
    nextSyncAt: timestamp("next_sync_at", { withTimezone: true, mode: "date" }),
    syncLeaseUntil: timestamp("sync_lease_until", { withTimezone: true, mode: "date" }),
    syncFailureCount: integer("sync_failure_count").notNull().default(0),
    lastSyncErrorCode: text("last_sync_error_code"),
    lastSyncErrorAt: timestamp("last_sync_error_at", { withTimezone: true, mode: "date" }),
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
    check(
      "social_channel_connection_status_valid",
      sql`${t.connectionStatus} IN ('manual', 'connected', 'needs_reauth', 'sync_error', 'disconnected')`,
    ),
    // Drizzle does not support partial unique indexes directly; the
    // partial-unique index on
    // `(workspace_id, platform, external_account_id) WHERE external_account_id IS NOT NULL AND archived_at IS NULL`
    // is declared in the SQL migration. The application also enforces
    // uniqueness at the repository layer.
  ],
);

// `socialConnectionId` is a plain UUID here; the FK to
// `social_connection(id)` is created by the SQL migration. We could
// re-export `socialConnections` from `social-analytics.ts` for join
// ergonomics, but a circular import between `channels.ts` and
// `social-analytics.ts` (which references `socialChannels.id`) makes
// that fragile. The application joins by the UUID column directly.

// ─── brand_assets ──────────────────────────────────────────────────────────
//
// `color_role` is a workspace-scoped categorization of a color asset
// (primary / secondary / accent / neutral). It is only meaningful
// for `kind = 'color'`; other kinds leave it NULL. Phase 8 (this
// commit) adds the column with a CHECK constraint that mirrors the
// Zod enum. Legacy rows (created before the migration) default to
// NULL; the form, grid, and AI loader all read the value
// defensively and fall back to "no role" when missing.
//
// The column is on the base `brand_assets` table (not in the
// `value` jsonb) so the AI loader can GROUP BY / filter by role
// at the SQL layer without scanning the jsonb for every row.
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
    /**
     * Phase 8 — color-role enum. NULL is allowed (the column is only
     * meaningful for `kind = 'color'`; other kinds carry a row for
     * their own data and the role is irrelevant). The CHECK below
     * is the same one Zod enforces on the createColorAsset command
     * — the DB is the source of truth, the schema is the structural
     * gate.
     */
    colorRole: text("color_role"),
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
    // Partial index on (workspace_id, color_role) for the colors page
    // KPI breakdown and the "show me all neutrals" filter; only
    // materialised for `kind = 'color'` rows so it stays small.
    index("brand_asset_color_role_idx")
      .on(t.workspaceId, t.colorRole)
      .where(sql`${t.kind} = 'color'`),
    check(
      "brand_asset_kind_valid",
      sql`${t.kind} IN ('logo', 'color', 'font', 'guideline', 'reference', 'other')`,
    ),
    check(
      "brand_asset_color_role_valid",
      sql`${t.colorRole} IS NULL OR ${t.colorRole} IN ('primary', 'secondary', 'accent', 'neutral')`,
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
