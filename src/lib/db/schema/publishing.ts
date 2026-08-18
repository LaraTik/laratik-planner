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
import { idColumn, timestamps } from "./_helpers";
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
  ],
);
