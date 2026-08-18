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
import { deliveryProviderEnum, reviewGateEnum, reviewStatusEnum } from "./enums";
import { users } from "./identity";
import { contentItems } from "./content";

/**
 * STUDIOFLOW_MASTER_PROMPT.md §8 — Deliveries and approvals:
 * delivery_versions, delivery_links, approval_requests, approval_decisions.
 *
 * "Allocate version numbers in a transaction using row locking. Never
 * calculate a version only in the browser." — service-layer concern.
 *
 * "Require https URLs and reject script, data, file, and javascript schemes."
 * — CHECK constraint below.
 *
 * "Changes requested requires non-empty feedback. Only one effective decision
 * per request. Historical invalidated approvals remain immutable." — CHECK
 * + service-layer concern.
 */

// ─── delivery_versions ────────────────────────────────────────────────────
export const deliveryVersions = pgTable(
  "delivery_version",
  {
    id: idColumn(),
    contentItemId: uuid("content_item_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    description: text("description").notNull(),
    designerNote: text("designer_note"),
    includedFormats: text("included_formats")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    submittedBy: uuid("submitted_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    isFinalApproved: boolean("is_final_approved").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("delivery_version_unique").on(t.contentItemId, t.versionNumber),
    check("delivery_version_number_positive", sql`${t.versionNumber} > 0`),
  ],
);

// ─── delivery_links ───────────────────────────────────────────────────────
export const deliveryLinks = pgTable(
  "delivery_link",
  {
    id: idColumn(),
    deliveryVersionId: uuid("delivery_version_id")
      .notNull()
      .references(() => deliveryVersions.id, { onDelete: "cascade" }),
    provider: deliveryProviderEnum("provider").notNull(),
    label: text("label").notNull(),
    url: text("url").notNull(),
    isPreview: boolean("is_preview").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("delivery_link_version_idx").on(t.deliveryVersionId),
    // "Require https URLs and reject script, data, file, and javascript schemes."
    check(
      "delivery_link_url_https",
      sql`${t.url} ~* '^https://'`,
    ),
  ],
);

// ─── approval_requests ────────────────────────────────────────────────────
export const approvalRequests = pgTable(
  "approval_request",
  {
    id: idColumn(),
    contentItemId: uuid("content_item_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    gate: reviewGateEnum("gate").notNull(),
    deliveryVersionId: uuid("delivery_version_id").references(() => deliveryVersions.id, {
      onDelete: "set null",
    }),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    requestedAt: timestamp("requested_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    dueAt: timestamp("due_at", { withTimezone: true, mode: "date" }),
    status: reviewStatusEnum("status").notNull().default("pending"),
    sequence: integer("sequence").notNull(),
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true, mode: "date" }),
    invalidationReason: text("invalidation_reason"),
    ...timestamps,
  },
  (t) => [
    index("approval_request_item_status_idx").on(t.contentItemId, t.status),
    // "partial unique indexes ... single pending approval per gate where applicable"
    uniqueIndex("approval_request_pending_unique")
      .on(t.contentItemId, t.gate)
      .where(sql`status = 'pending'`),
  ],
);

// ─── approval_decisions ───────────────────────────────────────────────────
export const approvalDecisions = pgTable(
  "approval_decision",
  {
    id: idColumn(),
    approvalRequestId: uuid("approval_request_id")
      .notNull()
      .references(() => approvalRequests.id, { onDelete: "cascade" }),
    reviewerId: uuid("reviewer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    decision: reviewStatusEnum("decision").notNull(), // 'approved' | 'changes_requested'
    feedback: text("feedback"),
    decidedAt: timestamp("decided_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("approval_decision_request_idx").on(t.approvalRequestId),
    check(
      "approval_decision_changes_needs_feedback",
      sql`${t.decision} <> 'changes_requested' OR ${t.feedback} IS NOT NULL`,
    ),
  ],
);
