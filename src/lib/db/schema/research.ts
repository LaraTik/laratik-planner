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
import { archivedAt, idColumn, timestamps } from "./_helpers";
import { contentItems } from "./content";
import { socialPostObservations } from "./social-analytics";
import { users } from "./identity";
import { workspaces } from "./workspaces";

/**
 * A lightweight provenance link between a planner draft and an observed
 * provider post. It is deliberately separate from formatPayload: the source
 * relationship is workflow metadata, not creative content.
 */
export const contentResearchLinks = pgTable(
  "content_research_link",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contentItemId: uuid("content_item_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    socialPostObservationId: uuid("social_post_observation_id")
      .notNull()
      .references(() => socialPostObservations.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    uniqueIndex("content_research_link_item_observation_unique").on(
      t.contentItemId,
      t.socialPostObservationId,
    ),
    index("content_research_link_workspace_created_idx").on(t.workspaceId, t.createdAt),
    index("content_research_link_observation_idx").on(t.socialPostObservationId),
  ],
);

/**
 * Provenance link for a planner draft created from a reviewed teardown.
 * Keep this separate from formatPayload: the research relationship is
 * workflow metadata and must survive edits to the creative brief.
 */
export const contentResearchTeardownLinks = pgTable(
  "content_research_teardown_link",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contentItemId: uuid("content_item_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    researchTeardownId: uuid("research_teardown_id")
      .notNull()
      .references(() => researchTeardowns.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    uniqueIndex("content_research_teardown_item_unique").on(t.contentItemId, t.researchTeardownId),
    index("content_research_teardown_workspace_created_idx").on(t.workspaceId, t.createdAt),
    index("content_research_teardown_teardown_idx").on(t.researchTeardownId),
  ],
);

/**
 * Named research projects for the Meedro-style "save to project" workflow.
 * Items have one active collection in v1; a join table is the upgrade path if
 * research needs multi-project reuse later.
 */
export const researchCollections = pgTable(
  "research_collection",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
    shareScope: text("share_scope").notNull().default("me"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("research_collection_workspace_owner_name_unique").on(
      t.workspaceId,
      t.createdBy,
      t.name,
    ),
    index("research_collection_workspace_created_idx").on(t.workspaceId, t.createdAt),
    check("research_collection_share_scope_valid", sql`${t.shareScope} IN ('me', 'workspace')`),
  ],
);

/**
 * Workspace research shelf for observed social posts. This is intentionally a
 * bookmark, not a copy of provider content; the observation remains the
 * source of truth and can later be joined by provider-specific research feeds.
 */
export const researchBookmarks = pgTable(
  "research_bookmark",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    socialPostObservationId: uuid("social_post_observation_id")
      .notNull()
      .references(() => socialPostObservations.id, { onDelete: "cascade" }),
    collectionId: uuid("collection_id").references(() => researchCollections.id, {
      onDelete: "set null",
    }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    uniqueIndex("research_bookmark_workspace_observation_unique").on(
      t.workspaceId,
      t.socialPostObservationId,
    ),
    index("research_bookmark_workspace_created_idx").on(t.workspaceId, t.createdAt),
    index("research_bookmark_observation_idx").on(t.socialPostObservationId),
    index("research_bookmark_collection_idx").on(t.collectionId),
  ],
);

/**
 * Workspace-scoped competitor/reference accounts. This is a source registry,
 * not a scraper: providerStatus stays explicit until an approved provider
 * capability can populate snapshots for the account.
 */
export const researchWatchlistAccounts = pgTable(
  "research_watchlist_account",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    platform: text("platform").notNull(),
    handle: text("handle").notNull(),
    displayName: text("display_name"),
    sourceUrl: text("source_url").notNull(),
    providerStatus: text("provider_status").notNull().default("manual"),
    providerErrorCode: text("provider_error_code"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true, mode: "date" }),
    archivedAt: archivedAt(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("research_watchlist_workspace_platform_handle_unique")
      .on(t.workspaceId, t.platform, t.handle)
      .where(sql`${t.archivedAt} IS NULL`),
    index("research_watchlist_workspace_created_idx").on(t.workspaceId, t.createdAt),
    check(
      "research_watchlist_platform_valid",
      sql`${t.platform} IN ('instagram', 'facebook', 'tiktok', 'youtube')`,
    ),
    check(
      "research_watchlist_provider_status_valid",
      sql`${t.providerStatus} IN ('manual', 'available', 'unsupported', 'error')`,
    ),
  ],
);

/**
 * A reviewed, structured teardown. Raw planner notes and provider bodies are
 * intentionally excluded; this is the durable research artifact only.
 */
export const researchTeardowns = pgTable(
  "research_teardown",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    collectionId: uuid("collection_id").references(() => researchCollections.id, {
      onDelete: "set null",
    }),
    sourceKind: text("source_kind").notNull(),
    sourceReference: text("source_reference"),
    result: jsonb("result").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("research_teardown_workspace_created_idx").on(t.workspaceId, t.createdAt),
    index("research_teardown_collection_idx").on(t.collectionId),
    check(
      "research_teardown_source_kind_valid",
      sql`${t.sourceKind} IN ('provider_media', 'owned_asset', 'planner_notes')`,
    ),
  ],
);

export type ContentResearchLink = typeof contentResearchLinks.$inferSelect;
export type NewContentResearchLink = typeof contentResearchLinks.$inferInsert;
export type ContentResearchTeardownLink = typeof contentResearchTeardownLinks.$inferSelect;
export type NewContentResearchTeardownLink = typeof contentResearchTeardownLinks.$inferInsert;
export type ResearchCollection = typeof researchCollections.$inferSelect;
export type NewResearchCollection = typeof researchCollections.$inferInsert;
export type ResearchBookmark = typeof researchBookmarks.$inferSelect;
export type NewResearchBookmark = typeof researchBookmarks.$inferInsert;
export type ResearchWatchlistAccount = typeof researchWatchlistAccounts.$inferSelect;
export type NewResearchWatchlistAccount = typeof researchWatchlistAccounts.$inferInsert;
export type ResearchTeardown = typeof researchTeardowns.$inferSelect;
export type NewResearchTeardown = typeof researchTeardowns.$inferInsert;
