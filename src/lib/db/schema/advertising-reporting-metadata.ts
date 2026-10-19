import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./_helpers";
import { agencies, users } from "./identity";
import { workspaces } from "./workspaces";
import { advertisingAccounts } from "./advertising";

/** Workspace-owned labels; these never mutate Meta provider objects. */
export const advertisingLocalTags = pgTable(
  "advertising_local_tag",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => advertisingAccounts.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    labelType: text("label_type").notNull(),
    tagValue: text("tag_value").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("advertising_local_tag_identity_uniq").on(
      t.workspaceId,
      t.accountId,
      t.entityType,
      t.entityId,
      t.labelType,
      t.tagValue,
    ),
    index("advertising_local_tag_entity_idx").on(
      t.workspaceId,
      t.accountId,
      t.entityType,
      t.entityId,
    ),
    check(
      "advertising_local_tag_entity_type_valid",
      sql`${t.entityType} IN ('campaign', 'adset', 'ad', 'creative')`,
    ),
    check(
      "advertising_local_tag_label_type_valid",
      sql`${t.labelType} IN ('brand', 'platform', 'objective', 'topic', 'language', 'month')`,
    ),
    check("advertising_local_tag_value_valid", sql`length(trim(${t.tagValue})) BETWEEN 1 AND 80`),
  ],
);

/** Authenticated, tenant-scoped report views. The token is never stored raw. */
export const advertisingReportShares = pgTable(
  "advertising_report_share",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => advertisingAccounts.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    viewConfig: jsonb("view_config").$type<Record<string, unknown>>().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("advertising_report_share_token_uniq").on(t.tokenHash),
    index("advertising_report_share_scope_idx").on(
      t.workspaceId,
      t.accountId,
      t.expiresAt,
      t.revokedAt,
    ),
  ],
);

export type AdvertisingLocalTag = typeof advertisingLocalTags.$inferSelect;
export type NewAdvertisingLocalTag = typeof advertisingLocalTags.$inferInsert;
export type AdvertisingReportShare = typeof advertisingReportShares.$inferSelect;
export type NewAdvertisingReportShare = typeof advertisingReportShares.$inferInsert;
