import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
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

/**
 * Advertising foundation — canonical provider connections and tenant-safe
 * access state. This is deliberately separate from social publishing and
 * social profile analytics: ad accounts can be shared by several connections
 * inside one agency and financial authority is a separate grant.
 */
export const advertisingConnections = pgTable(
  "advertising_connection",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    ownerType: text("owner_type").notNull().default("platform"),
    displayName: text("display_name").notNull(),
    status: text("status").notNull().default("invalid"),
    credentialRef: text("credential_ref").notNull(),
    currentCredentialVersion: integer("current_credential_version").notNull().default(0),
    appId: text("app_id"),
    graphApiVersion: text("graph_api_version"),
    lastValidatedAt: timestamp("last_validated_at", { withTimezone: true, mode: "date" }),
    lastValidationStatus: text("last_validation_status"),
    lastValidationCode: text("last_validation_code"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (t) => [
    index("advertising_connection_agency_idx").on(t.agencyId, t.status),
    uniqueIndex("advertising_connection_credential_ref_uniq").on(t.credentialRef),
    check("provider_provider_valid", sql`${t.provider} IN ('meta')`),
    check("advertising_connection_owner_type_valid", sql`${t.ownerType} IN ('platform', 'agency')`),
    check(
      "advertising_connection_status_valid",
      sql`${t.status} IN ('active', 'revoked', 'invalid')`,
    ),
    check(
      "advertising_connection_validation_status_valid",
      sql`${t.lastValidationStatus} IS NULL OR ${t.lastValidationStatus} IN ('passed', 'failed', 'partial')`,
    ),
    check(
      "advertising_connection_credential_version_valid",
      sql`${t.currentCredentialVersion} >= 0`,
    ),
  ],
);

export const advertisingCredentialVersions = pgTable(
  "advertising_credential_version",
  {
    id: idColumn(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => advertisingConnections.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    tag: text("tag").notNull(),
    keyVersion: smallint("key_version").notNull().default(1),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    uniqueIndex("advertising_credential_connection_version_uniq").on(t.connectionId, t.version),
    index("advertising_credential_connection_active_idx").on(t.connectionId, t.revokedAt),
    check("advertising_credential_version_positive", sql`${t.version} > 0`),
    check("advertising_credential_key_version_positive", sql`${t.keyVersion} > 0`),
  ],
);

/** One canonical row per agency/provider/external ad-account identity. */
export const advertisingAccounts = pgTable(
  "advertising_account",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalAccountId: text("external_account_id").notNull(),
    name: text("name").notNull(),
    currency: text("currency"),
    timezone: text("timezone"),
    status: text("status").notNull().default("active"),
    metadata: jsonb("metadata")
      .notNull()
      .default(sql`'{}'::jsonb`),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("advertising_account_agency_provider_external_uniq").on(
      t.agencyId,
      t.provider,
      t.externalAccountId,
    ),
    index("advertising_account_agency_status_idx").on(t.agencyId, t.status),
    check("provider_provider_valid", sql`${t.provider} IN ('meta')`),
    check(
      "advertising_account_status_valid",
      sql`${t.status} IN ('active', 'unavailable', 'revoked')`,
    ),
  ],
);

/** A credential can discover and access several canonical accounts. */
export const advertisingConnectionAccounts = pgTable(
  "advertising_connection_account",
  {
    id: idColumn(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => advertisingConnections.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => advertisingAccounts.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"),
    discoveredAt: timestamp("discovered_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true, mode: "date" }),
    metadata: jsonb("metadata")
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("advertising_connection_account_pair_uniq").on(t.connectionId, t.accountId),
    index("advertising_connection_account_account_idx").on(t.accountId, t.status),
    check(
      "advertising_connection_account_status_valid",
      sql`${t.status} IN ('active', 'unavailable', 'revoked')`,
    ),
  ],
);

/** Sanitized Facebook Page / Instagram professional identity discovery. */
export const advertisingSocialIdentities = pgTable(
  "advertising_social_identity",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => advertisingConnections.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => advertisingAccounts.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull(),
    identityType: text("identity_type").notNull(),
    externalIdentityId: text("external_identity_id").notNull(),
    displayName: text("display_name"),
    username: text("username"),
    parentExternalIdentityId: text("parent_external_identity_id"),
    status: text("status").notNull().default("active"),
    metadata: jsonb("metadata")
      .notNull()
      .default(sql`'{}'::jsonb`),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("advertising_social_identity_agency_provider_type_external_uniq").on(
      t.agencyId,
      t.provider,
      t.identityType,
      t.externalIdentityId,
    ),
    index("advertising_social_identity_account_idx").on(t.accountId, t.status),
    check("provider_provider_valid", sql`${t.provider} IN ('meta')`),
    check(
      "advertising_social_identity_type_valid",
      sql`${t.identityType} IN ('facebook_page', 'instagram_business')`,
    ),
    check(
      "advertising_social_identity_status_valid",
      sql`${t.status} IN ('active', 'unavailable', 'revoked')`,
    ),
  ],
);

/** Current capability state for a connection/account pair. */
export const advertisingCapabilities = pgTable(
  "advertising_capability",
  {
    id: idColumn(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => advertisingConnections.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => advertisingAccounts.id, { onDelete: "cascade" }),
    capability: text("capability").notNull(),
    status: text("status").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    lastValidationResultId: uuid("last_validation_result_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("advertising_capability_connection_account_capability_uniq").on(
      t.connectionId,
      t.accountId,
      t.capability,
    ),
    index("advertising_capability_account_idx").on(t.accountId, t.status),
    check(
      "advertising_capability_name_valid",
      sql`${t.capability} IN ('discover_accounts', 'read_campaigns', 'read_adsets', 'read_ads', 'read_creatives', 'read_reports', 'read_financials', 'manage_visibility_grants', 'run_diagnostics', 'use_ai_context', 'export_reports')`,
    ),
    check(
      "advertising_capability_status_valid",
      sql`${t.status} IN ('available', 'unavailable', 'partial', 'unknown')`,
    ),
  ],
);

/** Append-only sanitized results of credential/account/capability probes. */
export const advertisingValidationResults = pgTable(
  "advertising_validation_result",
  {
    id: idColumn(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => advertisingConnections.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => advertisingAccounts.id, {
      onDelete: "set null",
    }),
    operation: text("operation").notNull(),
    status: text("status").notNull(),
    sanitizedCode: text("sanitized_code"),
    providerRequestId: text("provider_request_id"),
    retryable: boolean("retryable").notNull().default(false),
    metadata: jsonb("metadata")
      .notNull()
      .default(sql`'{}'::jsonb`),
    checkedAt: timestamp("checked_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("advertising_validation_connection_checked_idx").on(
      t.connectionId,
      sql`${t.checkedAt} DESC`,
    ),
    index("advertising_validation_account_checked_idx").on(t.accountId, sql`${t.checkedAt} DESC`),
    check(
      "advertising_validation_operation_valid",
      sql`${t.operation} IN ('account_discovery', 'campaign_read', 'adset_read', 'ad_read', 'creative_read', 'daily_insights_read', 'breakdown_read', 'page_read', 'instagram_read', 'report_read', 'financial_read', 'diagnostics')`,
    ),
    check(
      "advertising_validation_status_valid",
      sql`${t.status} IN ('passed', 'failed', 'partial', 'unavailable')`,
    ),
  ],
);

/** Visibility grants are not financial authority. */
export const advertisingVisibilityGrants = pgTable(
  "advertising_visibility_grant",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => advertisingAccounts.id, { onDelete: "cascade" }),
    capability: text("capability").notNull(),
    campaignIds: text("campaign_ids").array(),
    adSetIds: text("ad_set_ids").array(),
    adIds: text("ad_ids").array(),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    grantedBy: uuid("granted_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    index("advertising_visibility_grant_workspace_idx").on(t.workspaceId, t.accountId, t.revokedAt),
    index("advertising_visibility_grant_account_idx").on(t.accountId, t.capability, t.revokedAt),
    check(
      "advertising_visibility_grant_capability_valid",
      sql`${t.capability} IN ('discover_accounts', 'read_campaigns', 'read_adsets', 'read_ads', 'read_creatives', 'read_reports', 'read_financials', 'manage_visibility_grants', 'run_diagnostics', 'use_ai_context', 'export_reports')`,
    ),
    check(
      "advertising_visibility_grant_range_valid",
      sql`${t.endsAt} IS NULL OR ${t.endsAt} > ${t.startsAt}`,
    ),
  ],
);

export const advertisingFinancialAuthorities = pgTable(
  "advertising_financial_authority",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => advertisingAccounts.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    grantedBy: uuid("granted_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    index("advertising_financial_authority_scope_idx").on(t.workspaceId, t.accountId, t.revokedAt),
    check(
      "advertising_financial_authority_range_valid",
      sql`${t.endsAt} IS NULL OR ${t.endsAt} > ${t.startsAt}`,
    ),
  ],
);

/** Immutable grant history; snapshots contain IDs and scopes, never secrets. */
export const advertisingGrantRevisions = pgTable(
  "advertising_grant_revision",
  {
    id: idColumn(),
    grantId: uuid("grant_id")
      .notNull()
      .references(() => advertisingVisibilityGrants.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    action: text("action").notNull(),
    snapshot: jsonb("snapshot")
      .notNull()
      .default(sql`'{}'::jsonb`),
    changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    uniqueIndex("advertising_grant_revision_grant_revision_uniq").on(t.grantId, t.revision),
    check(
      "advertising_grant_revision_action_valid",
      sql`${t.action} IN ('created', 'updated', 'revoked')`,
    ),
    check("advertising_grant_revision_positive", sql`${t.revision} > 0`),
  ],
);

export const advertisingSyncStates = pgTable(
  "advertising_sync_state",
  {
    id: idColumn(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => advertisingConnections.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => advertisingAccounts.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("idle"),
    cursor: text("cursor"),
    lastStartedAt: timestamp("last_started_at", { withTimezone: true, mode: "date" }),
    lastCompletedAt: timestamp("last_completed_at", { withTimezone: true, mode: "date" }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true, mode: "date" }),
    lastErrorCode: text("last_error_code"),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true, mode: "date" }),
    leaseOwner: text("lease_owner"),
    leaseToken: uuid("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true, mode: "date" }),
    attempt: integer("attempt").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("advertising_sync_state_connection_account_uniq").on(t.connectionId, t.accountId),
    index("advertising_sync_state_due_idx").on(t.status, t.nextRunAt),
    check(
      "advertising_sync_state_status_valid",
      sql`${t.status} IN ('idle', 'running', 'partial', 'failed', 'dead_letter', 'paused')`,
    ),
  ],
);

export const advertisingSyncRuns = pgTable(
  "advertising_sync_run",
  {
    id: idColumn(),
    syncStateId: uuid("sync_state_id")
      .notNull()
      .references(() => advertisingSyncStates.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => advertisingConnections.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => advertisingAccounts.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    rowsRead: integer("rows_read").notNull().default(0),
    rowsWritten: integer("rows_written").notNull().default(0),
    providerRequestId: text("provider_request_id"),
    errorCode: text("error_code"),
    partial: boolean("partial").notNull().default(false),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("advertising_sync_run_account_started_idx").on(t.accountId, sql`${t.startedAt} DESC`),
    check(
      "advertising_sync_run_status_valid",
      sql`${t.status} IN ('running', 'succeeded', 'partial', 'failed')`,
    ),
    check(
      "advertising_sync_run_counts_nonnegative",
      sql`${t.rowsRead} >= 0 AND ${t.rowsWritten} >= 0`,
    ),
  ],
);

/** Canonical provider ad-day facts. No workspace ownership is inferred here. */
export const advertisingSpendObservations = pgTable(
  "advertising_spend_observation",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => advertisingAccounts.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => advertisingConnections.id, { onDelete: "restrict" }),
    syncRunId: uuid("sync_run_id").references(() => advertisingSyncRuns.id, {
      onDelete: "set null",
    }),
    externalAdId: text("external_ad_id").notNull(),
    externalCampaignId: text("external_campaign_id"),
    externalAdSetId: text("external_ad_set_id"),
    reportDate: date("report_date").notNull(),
    currency: text("currency").notNull(),
    spend: numeric("spend", { precision: 18, scale: 6 }).notNull(),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    attributionWindow: text("attribution_window").notNull().default("account"),
    actionReportTime: text("action_report_time").notNull().default("mixed"),
    providerDataVersion: text("provider_data_version"),
    observedAt: timestamp("observed_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("advertising_spend_observation_identity_uniq").on(
      t.agencyId,
      t.accountId,
      t.externalAdId,
      t.reportDate,
      t.attributionWindow,
      t.actionReportTime,
    ),
    index("advertising_spend_observation_account_date_idx").on(t.accountId, t.reportDate),
    check("advertising_spend_observation_amount_valid", sql`${t.spend} >= 0`),
    check(
      "advertising_spend_observation_counts_valid",
      sql`${t.impressions} >= 0 AND ${t.clicks} >= 0`,
    ),
  ],
);

/** Reconciliation snapshot between canonical ad facts and an account report. */
export const advertisingSpendReconciliations = pgTable(
  "advertising_spend_reconciliation",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => advertisingAccounts.id, { onDelete: "cascade" }),
    reportDate: date("report_date").notNull(),
    currency: text("currency").notNull(),
    attributionWindow: text("attribution_window").notNull(),
    providerAccountSpend: numeric("provider_account_spend", {
      precision: 18,
      scale: 6,
    }).notNull(),
    canonicalAdSpend: numeric("canonical_ad_spend", { precision: 18, scale: 6 }).notNull(),
    workspaceAttributedSpend: numeric("workspace_attributed_spend", {
      precision: 18,
      scale: 6,
    }).notNull(),
    unallocatedSpend: numeric("unallocated_spend", { precision: 18, scale: 6 }).notNull(),
    discrepancy: numeric("discrepancy", { precision: 18, scale: 6 }).notNull(),
    completeness: text("completeness").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("advertising_spend_reconciliation_identity_uniq").on(
      t.agencyId,
      t.accountId,
      t.reportDate,
      t.attributionWindow,
    ),
    index("advertising_spend_reconciliation_account_date_idx").on(t.accountId, t.reportDate),
    check(
      "advertising_spend_reconciliation_completeness_valid",
      sql`${t.completeness} IN ('complete', 'partial', 'unavailable')`,
    ),
  ],
);

export type AdvertisingConnection = typeof advertisingConnections.$inferSelect;
export type NewAdvertisingConnection = typeof advertisingConnections.$inferInsert;
export type AdvertisingAccount = typeof advertisingAccounts.$inferSelect;
export type AdvertisingVisibilityGrant = typeof advertisingVisibilityGrants.$inferSelect;
export type AdvertisingSpendObservation = typeof advertisingSpendObservations.$inferSelect;
export type AdvertisingSpendReconciliation = typeof advertisingSpendReconciliations.$inferSelect;
