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
import { idColumn, timestamps } from "./_helpers";
import { agencies, users } from "./identity";
import { workspaces } from "./workspaces";
import { storageObjects } from "./storage";

/** Workspace-scoped, one-level media folders. `folder_id = NULL` is Unfiled. */
export const mediaFolders = pgTable(
  "media_folder",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    archivedBy: uuid("archived_by").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    index("media_folder_workspace_idx").on(t.workspaceId, t.sortOrder, t.createdAt),
    uniqueIndex("media_folder_workspace_name_active_uniq")
      .on(t.workspaceId, sql`lower(${t.name})`)
      .where(sql`${t.archivedAt} IS NULL`),
    check("media_folder_name_not_empty", sql`length(trim(${t.name})) BETWEEN 1 AND 80`),
    check("media_folder_sort_order_valid", sql`${t.sortOrder} >= 0`),
  ],
);

/**
 * Logical media catalog. `storage_object` remains the physical provider
 * record; this table owns the human-facing title, sharing policy, source
 * provenance, lifecycle, and future derived-preview references.
 */
export const mediaAssets = pgTable(
  "media_asset",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    ownerWorkspaceId: uuid("owner_workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    folderId: uuid("folder_id").references(() => mediaFolders.id, { onDelete: "set null" }),
    storageObjectId: uuid("storage_object_id")
      .notNull()
      .references(() => storageObjects.id, { onDelete: "restrict" }),
    previewStorageObjectId: uuid("preview_storage_object_id").references(() => storageObjects.id, {
      onDelete: "set null",
    }),
    posterStorageObjectId: uuid("poster_storage_object_id").references(() => storageObjects.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description"),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    altText: text("alt_text"),
    visibility: text("visibility").notNull().default("workspace"),
    status: text("status").notNull().default("processing"),
    sourceType: text("source_type").notNull().default("browser_file"),
    sourceProvider: text("source_provider"),
    sourceReference: text("source_reference"),
    sourceUrl: text("source_url"),
    sourceModifiedAt: timestamp("source_modified_at", { withTimezone: true, mode: "date" }),
    supersedesAssetId: uuid("supersedes_asset_id"),
    trashedAt: timestamp("trashed_at", { withTimezone: true, mode: "date" }),
    deleteAfter: timestamp("delete_after", { withTimezone: true, mode: "date" }),
    failureCode: text("failure_code"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("media_asset_storage_object_uniq").on(t.storageObjectId),
    index("media_asset_agency_status_idx").on(t.agencyId, t.status, t.createdAt),
    index("media_asset_workspace_status_idx").on(t.ownerWorkspaceId, t.status, t.createdAt),
    index("media_asset_folder_idx").on(t.ownerWorkspaceId, t.folderId, t.createdAt),
    index("media_asset_visibility_idx").on(t.agencyId, t.visibility, t.status),
    index("media_asset_source_idx").on(t.sourceType, t.sourceProvider),
    check("media_asset_title_not_empty", sql`length(trim(${t.title})) BETWEEN 1 AND 160`),
    check("media_asset_visibility_valid", sql`${t.visibility} IN ('workspace', 'agency')`),
    check(
      "media_asset_status_valid",
      sql`${t.status} IN ('processing', 'ready', 'failed', 'trashed', 'deleted')`,
    ),
    check(
      "media_asset_source_type_valid",
      sql`${t.sourceType} IN ('browser_file', 'external_url', 'google_drive', 'onedrive', 'legacy')`,
    ),
  ],
);

/** Public, anonymous access grants for exactly one ready image asset. */
export const mediaShareLinks = pgTable(
  "media_share_link",
  {
    id: idColumn(),
    mediaAssetId: uuid("media_asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("media_share_link_token_hash_uniq").on(t.tokenHash),
    uniqueIndex("media_share_link_active_asset_uniq")
      .on(t.mediaAssetId)
      .where(sql`${t.revokedAt} IS NULL`),
    index("media_share_link_asset_idx").on(t.mediaAssetId, t.expiresAt),
  ],
);

/** Explicit consuming-workspace links; polymorphic targets avoid schema cycles. */
export const mediaAssetLinks = pgTable(
  "media_asset_link",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    mediaAssetId: uuid("media_asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "restrict" }),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    clientVisible: boolean("client_visible").notNull().default(false),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("media_asset_link_target_uniq").on(t.mediaAssetId, t.targetType, t.targetId),
    index("media_asset_link_workspace_idx").on(t.workspaceId, t.createdAt),
    index("media_asset_link_target_idx").on(t.targetType, t.targetId),
    check(
      "media_asset_link_target_type_valid",
      sql`${t.targetType} IN ('content_item', 'comment', 'delivery', 'brand_asset')`,
    ),
  ],
);

export type MediaAsset = typeof mediaAssets.$inferSelect;
export type NewMediaAsset = typeof mediaAssets.$inferInsert;
export type MediaAssetLink = typeof mediaAssetLinks.$inferSelect;
export type NewMediaAssetLink = typeof mediaAssetLinks.$inferInsert;
export type MediaFolder = typeof mediaFolders.$inferSelect;
export type NewMediaFolder = typeof mediaFolders.$inferInsert;
export type MediaShareLink = typeof mediaShareLinks.$inferSelect;
export type NewMediaShareLink = typeof mediaShareLinks.$inferInsert;
