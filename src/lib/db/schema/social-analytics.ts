import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./_helpers";
import { users } from "./identity";
import { workspaces } from "./workspaces";
import { socialChannels } from "./channels";

/**
 * M4 — social profile analytics.
 *
 * Three new tables that hold provider connections, one-time OAuth state,
 * and the normalized daily metric. The schema mirrors migration
 * `0013_social_profile_analytics.sql` exactly. See ADR-0004 for the
 * design decisions behind this shape.
 *
 * The canonical profile row (`social_channel`) lives in `channels.ts`
 * and is extended additively with the provider linkage columns. We do
 * not duplicate that definition here.
 */

// ─── social_connection ─────────────────────────────────────────────────────
//
// One row per (workspace, provider, provider_subject_id). The
// `credentials_*` columns hold the AES-256-GCM-sealed envelope (see
// `src/lib/social/crypto.ts` for the AAD and key-version contract).
// The partial unique index on
// `(workspace_id, provider, provider_subject_id) WHERE revoked_at IS NULL`
// is declared in SQL because Drizzle does not currently support partial
// unique indexes; the constraint name is the source of truth.
//
// Index `social_connection_workspace_idx` on (workspace_id, status)
// — the OTHER-11 audit (GAP-FULL-REVIEW-2026-08-25) confirmed this
// index is required for the workspace-scoped lookups done by
// `listConnectionsForWorkspace` and the finalize-selection flow.
// Without it, every `eq(socialConnection.workspaceId, ws.id)` query
// would do a sequential scan.
export const socialConnections = pgTable(
  "social_connection",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerSubjectId: text("provider_subject_id").notNull(),
    status: text("status").notNull().default("pending_selection"),
    scopes: text("scopes")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    credentialsCiphertext: text("credentials_ciphertext").notNull(),
    credentialsIv: text("credentials_iv").notNull(),
    credentialsTag: text("credentials_tag").notNull(),
    credentialsKeyVersion: integer("credentials_key_version").notNull().default(1),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    metadata: jsonb("metadata").notNull().default({}),
    connectedBy: uuid("connected_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    connectedAt: timestamp("connected_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true, mode: "date" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (t) => [
    check("social_connection_provider_valid", sql`${t.provider} IN ('meta', 'tiktok')`),
    check(
      "social_connection_status_valid",
      sql`${t.status} IN ('pending_selection', 'active', 'needs_reauth', 'error', 'revoked')`,
    ),
    index("social_connection_workspace_idx").on(t.workspaceId, t.status),
  ],
);

// ─── social_oauth_state ────────────────────────────────────────────────────
//
// Short-lived CSRF bag. The application generates 32 random bytes for
// the state and stores only `sha256(state)` so a leaked DB row does
// not enable a CSRF replay. The callback route consumes the row inside
// a single transaction (lock + verify digest + set consumed_at).
export const socialOauthStates = pgTable(
  "social_oauth_state",
  {
    id: idColumn(),
    stateDigest: text("state_digest").notNull().unique(),
    provider: text("provider").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    returnPath: text("return_path").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    check("social_oauth_state_provider_valid", sql`${t.provider} IN ('meta', 'tiktok')`),
    check(
      "social_oauth_state_return_path_safe",
      sql`${t.returnPath} ~ '^/app/w/[a-z0-9-]+/channels$'`,
    ),
  ],
);

// ─── social_profile_daily_metric ───────────────────────────────────────────
//
// One row per (channel, calendar day in workspace timezone). The unique
// index on `(social_channel_id, metric_date)` lets the sync worker
// upsert with `ON CONFLICT ... DO UPDATE`, silently replacing the
// prior observed total when the provider corrects itself.
export const socialProfileDailyMetrics = pgTable(
  "social_profile_daily_metric",
  {
    id: idColumn(),
    socialChannelId: uuid("social_channel_id")
      .notNull()
      .references(() => socialChannels.id, { onDelete: "cascade" }),
    metricDate: date("metric_date").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true, mode: "date" }).notNull(),
    followerCount: bigint("follower_count", { mode: "number" }),
    followingCount: bigint("following_count", { mode: "number" }),
    mediaCount: bigint("media_count", { mode: "number" }),
    likesCount: bigint("likes_count", { mode: "number" }),
    reach: bigint("reach", { mode: "number" }),
    views: bigint("views", { mode: "number" }),
    engagedAccounts: bigint("engaged_accounts", { mode: "number" }),
    interactions: bigint("interactions", { mode: "number" }),
    providerApiVersion: text("provider_api_version").notNull(),
    providerRequestId: text("provider_request_id"),
    responseHash: text("response_hash").notNull(),
    sourceMetadata: jsonb("source_metadata").notNull().default({}),
    ...timestamps,
  },
  (t) => [
    check(
      "social_profile_metric_counts_non_negative",
      sql`follower_count >= 0
        AND (following_count IS NULL OR following_count >= 0)
        AND (media_count IS NULL OR media_count >= 0)
        AND (likes_count IS NULL OR likes_count >= 0)
        AND (reach IS NULL OR reach >= 0)
        AND (views IS NULL OR views >= 0)
        AND (engaged_accounts IS NULL OR engaged_accounts >= 0)
        AND (interactions IS NULL OR interactions >= 0)`,
    ),
    uniqueIndex("social_profile_metric_channel_date_unique").on(t.socialChannelId, t.metricDate),
    index("social_profile_metric_channel_observed_idx").on(t.socialChannelId, t.observedAt),
  ],
);
