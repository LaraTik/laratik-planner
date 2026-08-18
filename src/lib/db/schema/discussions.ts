import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./_helpers";
import { commentLabelEnum, commentVisibilityEnum } from "./enums";
import { users } from "./identity";
import { contentItems } from "./content";
import { workspaces } from "./workspaces";

/**
 * STUDIOFLOW_MASTER_PROMPT.md §8 — Discussion + attachments.
 *
 * "Client reviewers may read only client-visible comments on items available
 * to them. A reply cannot be less restrictive than an internal parent."
 * Enforced via the `comment_visibility` column + service-layer check that
 * a reply's visibility <= parent's visibility.
 */

// ─── comments ─────────────────────────────────────────────────────────────
export const comments = pgTable(
  "comment",
  {
    id: idColumn(),
    contentItemId: uuid("content_item_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    parentCommentId: uuid("parent_comment_id"),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    visibility: commentVisibilityEnum("visibility").notNull(),
    label: commentLabelEnum("label").notNull().default("general"),
    body: text("body").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    editedAt: timestamp("edited_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (t) => [
    index("comment_item_created_idx").on(t.contentItemId, t.createdAt),
    index("comment_author_idx").on(t.authorId),
    check("comment_body_not_empty", sql`length(${t.body}) > 0`),
  ],
);

export const commentMentions = pgTable(
  "comment_mention",
  {
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    mentionedUserId: uuid("mentioned_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.mentionedUserId] })],
);

// ─── attachments ──────────────────────────────────────────────────────────
export const attachments = pgTable(
  "attachment",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    contentItemId: uuid("content_item_id").references(() => contentItems.id, {
      onDelete: "set null",
    }),
    commentId: uuid("comment_id").references(() => comments.id, { onDelete: "set null" }),
    deliveryVersionId: uuid("delivery_version_id"), // FK to delivery_versions added in deliveries.ts
    kind: text("kind").notNull(), // 'reference' | 'preview' | 'logo' | 'brief' | 'comment'
    storagePath: text("storage_path").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("attachment_workspace_idx").on(t.workspaceId),
    index("attachment_content_item_idx").on(t.contentItemId),
    check(
      "attachment_kind_valid",
      sql`${t.kind} IN ('reference', 'preview', 'logo', 'brief', 'comment')`,
    ),
  ],
);
