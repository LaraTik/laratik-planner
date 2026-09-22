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
} from "drizzle-orm/pg-core";
import { idColumn, jsonb, timestamps } from "./_helpers";
import { publicationStatusEnum } from "./enums";
import { users } from "./identity";
import { contentItemChannels } from "./content";

/**
 * STUDIOFLOW_MASTER_PROMPT.md §8 — Publishing.
 *
 * "published requires actual_published_at, published_url, and publisher_id.
 *  skipped requires a note explaining why.
 *  failed requires failure_reason.
 *  pending clears publication-specific values.
 *  published_url must use https.
 *  overall content status is partially_published when at least one selected
 *  channel is published or skipped and at least one remains pending or failed.
 *  overall content status is published only when every selected channel is
 *  published or skipped."
 *
 * Per-row CHECKs below enforce the row invariants; aggregate status
 * derivation lives in the publishing service (Goal 10).
 */

export const publicationRecords = pgTable(
  "publication_record",
  {
    id: idColumn(),
    contentItemChannelId: uuid("content_item_channel_id")
      .notNull()
      .references(() => contentItemChannels.id, { onDelete: "cascade" }),
    status: publicationStatusEnum("status").notNull().default("pending"),
    actualPublishedAt: timestamp("actual_published_at", {
      withTimezone: true,
      mode: "date",
    }),
    publishedUrl: text("published_url"),
    publisherId: uuid("publisher_id").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    failureReason: text("failure_reason"),
    attemptNumber: integer("attempt_number").notNull().default(0),
    verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
    /**
     * Optional provider-side publication link. This is deliberately
     * separate from `status`: a Meta post can be scheduled while the
     * Planner publication remains pending, then becomes published only
     * after a later provider reconciliation confirms it is live.
     */
    externalProvider: text("external_provider"),
    externalPostId: text("external_post_id"),
    externalStatus: text("external_status"),
    externalPermalink: text("external_permalink"),
    externalScheduledAt: timestamp("external_scheduled_at", {
      withTimezone: true,
      mode: "date",
    }),
    externalPublishedAt: timestamp("external_published_at", {
      withTimezone: true,
      mode: "date",
    }),
    externalLastSeenAt: timestamp("external_last_seen_at", {
      withTimezone: true,
      mode: "date",
    }),
    externalLastSyncedAt: timestamp("external_last_synced_at", {
      withTimezone: true,
      mode: "date",
    }),
    externalErrorCode: text("external_error_code"),
    externalSnapshot: jsonb("external_snapshot").notNull().default({}),
    externalLinkedBy: uuid("external_linked_by").references(() => users.id, {
      onDelete: "set null",
    }),
    externalLinkedAt: timestamp("external_linked_at", {
      withTimezone: true,
      mode: "date",
    }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("publication_record_channel_unique").on(t.contentItemChannelId),
    index("publication_record_status_idx").on(t.status),
    check(
      "publication_published_needs_url_time_publisher",
      sql`${t.status} <> 'published' OR (
        ${t.actualPublishedAt} IS NOT NULL
        AND ${t.publishedUrl} IS NOT NULL
        AND ${t.publisherId} IS NOT NULL
      )`,
    ),
    check("publication_skipped_needs_note", sql`${t.status} <> 'skipped' OR ${t.note} IS NOT NULL`),
    check(
      "publication_failed_needs_reason",
      sql`${t.status} <> 'failed' OR ${t.failureReason} IS NOT NULL`,
    ),
    check(
      "publication_pending_clears_published_fields",
      sql`${t.status} <> 'pending' OR (
        ${t.actualPublishedAt} IS NULL
        AND ${t.publishedUrl} IS NULL
        AND ${t.publisherId} IS NULL
      )`,
    ),
    check(
      "publication_published_url_https",
      sql`${t.publishedUrl} IS NULL OR ${t.publishedUrl} ~* '^https://'`,
    ),
    check("publication_attempt_non_negative", sql`${t.attemptNumber} >= 0`),
    uniqueIndex("publication_record_external_post_unique").on(t.externalProvider, t.externalPostId),
    check(
      "publication_external_provider_valid",
      sql`${t.externalProvider} IS NULL OR ${t.externalProvider} IN ('meta')`,
    ),
    check(
      "publication_external_status_valid",
      sql`${t.externalStatus} IS NULL OR ${t.externalStatus} IN ('scheduled', 'published', 'unavailable', 'error')`,
    ),
    check(
      "publication_external_identity_pair",
      sql`(${t.externalProvider} IS NULL AND ${t.externalPostId} IS NULL) OR (${t.externalProvider} IS NOT NULL AND ${t.externalPostId} IS NOT NULL)`,
    ),
    check(
      "publication_external_permalink_https",
      sql`${t.externalPermalink} IS NULL OR ${t.externalPermalink} ~* '^https://'`,
    ),
  ],
);
