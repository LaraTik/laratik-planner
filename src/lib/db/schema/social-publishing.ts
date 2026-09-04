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
import { socialChannels } from "./channels";
import { socialConnections } from "./social-analytics";

/**
 * Meta publishing readiness foundation.
 *
 * These records intentionally describe capability and readiness only. They
 * do not execute provider mutations. The future publish job/attempt tables
 * will be added after this contract is verified in the Meta sandbox.
 */

export const SOCIAL_PUBLISHING_OPERATIONS = [
  "analytics_read",
  "facebook_page_publish",
  "instagram_content_publish",
] as const;

export type SocialPublishingOperation = (typeof SOCIAL_PUBLISHING_OPERATIONS)[number];

export const SOCIAL_PUBLISHING_CAPABILITY_STATUSES = [
  "not_requested",
  "pending",
  "active",
  "needs_reauth",
  "revoked",
  "unavailable",
  "error",
] as const;

export type SocialPublishingCapabilityStatus =
  (typeof SOCIAL_PUBLISHING_CAPABILITY_STATUSES)[number];

export const socialConnectionCapabilities = pgTable(
  "social_connection_capability",
  {
    id: idColumn(),
    socialConnectionId: uuid("social_connection_id")
      .notNull()
      .references(() => socialConnections.id, { onDelete: "cascade" }),
    socialChannelId: uuid("social_channel_id")
      .notNull()
      .references(() => socialChannels.id, { onDelete: "cascade" }),
    operation: text("operation").notNull(),
    status: text("status").notNull().default("not_requested"),
    // Provider task/scope evidence is sanitized and must never contain
    // access tokens or raw provider responses.
    evidence: jsonb("evidence").notNull().default({}),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true, mode: "date" }),
    grantedAt: timestamp("granted_at", { withTimezone: true, mode: "date" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    lastErrorCode: text("last_error_code"),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("social_connection_capability_channel_operation_uniq").on(
      t.socialChannelId,
      t.operation,
    ),
    index("social_connection_capability_connection_idx").on(t.socialConnectionId, t.status),
    check(
      "social_connection_capability_operation_valid",
      sql`${t.operation} IN ('analytics_read', 'facebook_page_publish', 'instagram_content_publish')`,
    ),
    check(
      "social_connection_capability_status_valid",
      sql`${t.status} IN ('not_requested', 'pending', 'active', 'needs_reauth', 'revoked', 'unavailable', 'error')`,
    ),
  ],
);

export type SocialConnectionCapability = typeof socialConnectionCapabilities.$inferSelect;

/**
 * Reserved execution contract. This table is deliberately present only as a
 * type-level boundary for the next milestone; no write path is exposed until
 * provider-safe media delivery and idempotent execution are implemented.
 */
export type PublishExecutionContext = {
  workspaceId: string;
  contentItemId: string;
  contentItemChannelId: string;
  socialChannelId: string;
  socialConnectionId: string;
  deliveryVersionId: string;
  payloadRevision: number;
};

export type PublishCapabilitySummary = {
  operation: SocialPublishingOperation;
  status: SocialPublishingCapabilityStatus;
  lastCheckedAt: Date | null;
  lastErrorCode: string | null;
};

export type MetaPublishingStatus =
  | "not_configured"
  | "analytics_only"
  | "not_enabled"
  | "app_review_pending"
  | "business_verification_pending"
  | "needs_reauth"
  | "ready"
  | "no_destinations";

export type MetaPublishingReadiness = {
  status: MetaPublishingStatus;
  canQueue: boolean;
  blockers: string[];
  capabilities: PublishCapabilitySummary[];
};
