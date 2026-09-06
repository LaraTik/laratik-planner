import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./_helpers";
import { agencies, users } from "./identity";
import { workspaces } from "./workspaces";

/** Database-owned object storage configuration and lifecycle records. */
export const platformStorageProviderConfigs = pgTable(
  "platform_storage_provider_config",
  {
    id: idColumn(),
    provider: text("provider").notNull().default("r2"),
    accountId: text("account_id").notNull(),
    endpoint: text("endpoint").notNull(),
    bucket: text("bucket").notNull(),
    accessKeyCiphertext: text("access_key_ciphertext").notNull(),
    accessKeyLastFour: text("access_key_last_four").notNull(),
    accessKeyKeyVersion: smallint("access_key_key_version").notNull().default(1),
    secretAccessKeyCiphertext: text("secret_access_key_ciphertext").notNull(),
    secretAccessKeyLastFour: text("secret_access_key_last_four").notNull(),
    secretAccessKeyKeyVersion: smallint("secret_access_key_key_version").notNull().default(1),
    storageClass: text("storage_class").notNull().default("standard"),
    enabled: boolean("enabled").notNull().default(true),
    status: text("status").notNull().default("not_tested"),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true, mode: "date" }),
    lastTestedOk: boolean("last_tested_ok"),
    lastErrorCode: text("last_error_code"),
    configuredBy: uuid("configured_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("platform_storage_provider_config_provider_uniq").on(t.provider),
    check("platform_storage_provider_config_provider_valid", sql`${t.provider} = 'r2'`),
    check(
      "platform_storage_provider_config_storage_class_valid",
      sql`${t.storageClass} = 'standard'`,
    ),
    check(
      "platform_storage_provider_config_status_valid",
      sql`${t.status} IN ('not_tested', 'healthy', 'unhealthy', 'disabled')`,
    ),
    check(
      "platform_storage_provider_config_key_versions_valid",
      sql`${t.accessKeyKeyVersion} BETWEEN 1 AND 32767 AND ${t.secretAccessKeyKeyVersion} BETWEEN 1 AND 32767`,
    ),
  ],
);

export const agencyStorageConfigs = pgTable(
  "agency_storage_config",
  {
    agencyId: uuid("agency_id")
      .primaryKey()
      .references(() => agencies.id, { onDelete: "cascade" }),
    mode: text("mode").notNull().default("managed"),
    provider: text("provider").notNull().default("r2"),
    keyPrefix: text("key_prefix").notNull(),
    bucketOverride: text("bucket_override"),
    endpointOverride: text("endpoint_override"),
    accessKeyCiphertext: text("access_key_ciphertext"),
    accessKeyLastFour: text("access_key_last_four"),
    accessKeyKeyVersion: smallint("access_key_key_version"),
    secretAccessKeyCiphertext: text("secret_access_key_ciphertext"),
    secretAccessKeyLastFour: text("secret_access_key_last_four"),
    secretAccessKeyKeyVersion: smallint("secret_access_key_key_version"),
    enabled: boolean("enabled").notNull().default(true),
    status: text("status").notNull().default("pending"),
    lastHealthCheckAt: timestamp("last_health_check_at", { withTimezone: true, mode: "date" }),
    lastHealthCheckOk: boolean("last_health_check_ok"),
    lastErrorCode: text("last_error_code"),
    configuredBy: uuid("configured_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    check("agency_storage_config_mode_valid", sql`${t.mode} IN ('managed', 'agency_owned')`),
    check("agency_storage_config_provider_valid", sql`${t.provider} = 'r2'`),
    check(
      "agency_storage_config_status_valid",
      sql`${t.status} IN ('pending', 'healthy', 'unhealthy', 'disabled')`,
    ),
    check(
      "agency_storage_config_key_versions_valid",
      sql`(${t.accessKeyKeyVersion} IS NULL OR ${t.accessKeyKeyVersion} BETWEEN 1 AND 32767) AND (${t.secretAccessKeyKeyVersion} IS NULL OR ${t.secretAccessKeyKeyVersion} BETWEEN 1 AND 32767)`,
    ),
    index("agency_storage_config_status_idx").on(t.status),
  ],
);

export const storageObjects = pgTable(
  "storage_object",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    provider: text("provider").notNull().default("r2"),
    bucket: text("bucket").notNull(),
    objectKey: text("object_key").notNull(),
    status: text("status").notNull().default("active"),
    kind: text("kind").notNull(),
    originalName: text("original_name"),
    mimeType: text("mime_type").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    checksumSha256: text("checksum_sha256"),
    width: integer("width"),
    height: integer("height"),
    durationMs: bigint("duration_ms", { mode: "number" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
    deleteAfter: timestamp("delete_after", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("storage_object_agency_key_uniq").on(t.agencyId, t.objectKey),
    index("storage_object_workspace_idx").on(t.workspaceId, t.status),
    index("storage_object_checksum_idx").on(t.agencyId, t.checksumSha256),
    check("storage_object_provider_valid", sql`${t.provider} = 'r2'`),
    check(
      "storage_object_status_valid",
      sql`${t.status} IN ('pending', 'active', 'soft_deleted', 'deleted')`,
    ),
    check("storage_object_byte_size_positive", sql`${t.byteSize} > 0`),
    check(
      "storage_object_dimensions_nonnegative",
      sql`(${t.width} IS NULL OR ${t.width} > 0) AND (${t.height} IS NULL OR ${t.height} > 0) AND (${t.durationMs} IS NULL OR ${t.durationMs} >= 0)`,
    ),
  ],
);

export const storageUploadIntents = pgTable(
  "storage_upload_intent",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    objectId: uuid("object_id").references(() => storageObjects.id, { onDelete: "set null" }),
    provider: text("provider").notNull().default("r2"),
    bucket: text("bucket").notNull(),
    objectKey: text("object_key").notNull(),
    kind: text("kind").notNull(),
    extension: text("extension").notNull(),
    contentType: text("content_type").notNull(),
    expectedByteSize: bigint("expected_byte_size", { mode: "number" }).notNull(),
    reservedByteSize: bigint("reserved_byte_size", { mode: "number" }).notNull(),
    checksumSha256: text("checksum_sha256"),
    status: text("status").notNull().default("reserved"),
    uploadExpiresAt: timestamp("upload_expires_at", { withTimezone: true, mode: "date" }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    failedAt: timestamp("failed_at", { withTimezone: true, mode: "date" }),
    errorCode: text("error_code"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    index("storage_upload_intent_agency_status_idx").on(t.agencyId, t.status, t.uploadExpiresAt),
    index("storage_upload_intent_workspace_idx").on(t.workspaceId, t.createdAt),
    uniqueIndex("storage_upload_intent_object_key_uniq").on(t.objectKey),
    check("storage_upload_intent_provider_valid", sql`${t.provider} = 'r2'`),
    check(
      "storage_upload_intent_status_valid",
      sql`${t.status} IN ('reserved', 'uploaded', 'completed', 'failed', 'expired', 'aborted')`,
    ),
    check("storage_upload_intent_expected_size_positive", sql`${t.expectedByteSize} > 0`),
    check("storage_upload_intent_reserved_size_positive", sql`${t.reservedByteSize} > 0`),
  ],
);

export type PlatformStorageProviderConfig = typeof platformStorageProviderConfigs.$inferSelect;
export type NewPlatformStorageProviderConfig = typeof platformStorageProviderConfigs.$inferInsert;
export type AgencyStorageConfig = typeof agencyStorageConfigs.$inferSelect;
export type NewAgencyStorageConfig = typeof agencyStorageConfigs.$inferInsert;
export type StorageObject = typeof storageObjects.$inferSelect;
export type NewStorageObject = typeof storageObjects.$inferInsert;
export type StorageUploadIntent = typeof storageUploadIntents.$inferSelect;
export type NewStorageUploadIntent = typeof storageUploadIntents.$inferInsert;
