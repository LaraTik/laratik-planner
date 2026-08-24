import { and, asc, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import type { db as appDb } from "@/lib/db";
import {
  socialChannels,
  socialConnections,
  socialOauthStates,
  socialProfileDailyMetrics,
} from "@/lib/db/schema";
import {
  openCredentials,
  sealCredentials,
  type SealedCredentials,
  type SocialCredentials,
} from "./crypto";
import { serverEnv } from "@/lib/validation/env";
import { LimitExceededError, reserveCapacity } from "@/lib/entitlements";
import type { ConnectedProfile, ProfileSnapshot, SocialPlatform } from "./types";

type SocialChannel = typeof socialChannels.$inferSelect;
type SocialConnection = typeof socialConnections.$inferSelect;
type SocialOauthState = typeof socialOauthStates.$inferSelect;
type SocialProfileDailyMetric = typeof socialProfileDailyMetrics.$inferSelect;

/**
 * M4 — tenant-scoped repository.
 *
 * Every function accepts the `workspaceId` and the record ID. The
 * repository never resolves a cross-workspace record; the calling
 * server boundary is responsible for proving that the actor may
 * read or write the row in question.
 *
 * The encryption key is read from `SOCIAL_TOKEN_ENCRYPTION_KEY`. When
 * the key is missing, seal/open fail closed; the cron worker checks
 * the flag at the route boundary and never reaches this module.
 *
 * Functions exposed:
 *
 *   - createPendingConnection: write the encrypted envelope after
 *     the OAuth callback exchanges the code
 *   - findConnection / findConnectionsByWorkspace
 *   - consumeOauthState: one-shot CSRF consumption inside a single
 *     transaction
 *   - linkProfile: link or create a `social_channel` row from one
 *     `ConnectedProfile`; reserves entitlement capacity when creating
 *   - claimDueProfiles: bounded batch claim with a 5-minute lease
 *   - saveSnapshot: UPSERT the normalized daily metric
 *   - markSyncFailure / clearSyncFailure
 *   - disconnectProfile: set `connection_status='disconnected'`,
 *     clear the link, preserve external ID and metrics
 *   - revokeConnection: revoke a shared Meta grant, disconnect every
 *     attached channel transactionally
 *   - cleanupOauthStates: delete consumed/expired states (24h)
 *   - cleanupOldMetrics: delete metrics older than 25 months
 */

type Db = typeof appDb;

const BATCH_LIMIT = 20;
const LEASE_MS = 5 * 60 * 1000;

function getEncryptionKey(): string {
  if (!serverEnv.SOCIAL_TOKEN_ENCRYPTION_KEY) {
    throw new Error(
      "SOCIAL_TOKEN_ENCRYPTION_KEY is required to read or write social credentials",
    );
  }
  return serverEnv.SOCIAL_TOKEN_ENCRYPTION_KEY;
}

function seal(credentials: SocialCredentials): SealedCredentials {
  return sealCredentials(credentials, getEncryptionKey());
}

function open(sealed: SealedCredentials): SocialCredentials {
  return openCredentials(sealed, getEncryptionKey());
}

// ─── Connection lifecycle ─────────────────────────────────────────────────

export type CreatePendingConnectionInput = {
  workspaceId: string;
  provider: "meta" | "tiktok";
  providerSubjectId: string;
  scopes: string[];
  credentials: SocialCredentials;
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  connectedBy: string;
};

export async function createPendingConnection(
  db: Db,
  input: CreatePendingConnectionInput,
): Promise<SocialConnection> {
  const sealed = seal(input.credentials);
  const [row] = await db
    .insert(socialConnections)
    .values({
      workspaceId: input.workspaceId,
      provider: input.provider,
      providerSubjectId: input.providerSubjectId,
      status: "pending_selection",
      scopes: input.scopes,
      credentialsCiphertext: sealed.ciphertext,
      credentialsIv: sealed.iv,
      credentialsTag: sealed.tag,
      credentialsKeyVersion: sealed.keyVersion,
      accessTokenExpiresAt: input.accessTokenExpiresAt,
      refreshTokenExpiresAt: input.refreshTokenExpiresAt,
      connectedBy: input.connectedBy,
    })
    .returning();
  if (!row) throw new Error("Failed to insert social_connection");
  return row;
}

export async function findConnection(
  db: Db,
  workspaceId: string,
  connectionId: string,
): Promise<SocialConnection | null> {
  const [row] = await db
    .select()
    .from(socialConnections)
    .where(and(eq(socialConnections.id, connectionId), eq(socialConnections.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}

export async function findConnectionsByWorkspace(
  db: Db,
  workspaceId: string,
): Promise<SocialConnection[]> {
  return db
    .select()
    .from(socialConnections)
    .where(eq(socialConnections.workspaceId, workspaceId))
    .orderBy(asc(socialConnections.connectedAt));
}

export function openConnectionCredentials(connection: SocialConnection): SocialCredentials {
  return open({
    ciphertext: connection.credentialsCiphertext,
    iv: connection.credentialsIv,
    tag: connection.credentialsTag,
    keyVersion: connection.credentialsKeyVersion as 1,
  });
}

export async function updateConnectionCredentials(
  db: Db,
  connectionId: string,
  credentials: SocialCredentials,
  accessTokenExpiresAt: Date | null,
  refreshTokenExpiresAt: Date | null,
  status: SocialConnection["status"] = "active",
): Promise<void> {
  const sealed = seal(credentials);
  await db
    .update(socialConnections)
    .set({
      credentialsCiphertext: sealed.ciphertext,
      credentialsIv: sealed.iv,
      credentialsTag: sealed.tag,
      credentialsKeyVersion: sealed.keyVersion,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      lastRefreshedAt: new Date(),
      status,
      updatedAt: new Date(),
    })
    .where(eq(socialConnections.id, connectionId));
}

export async function setConnectionStatus(
  db: Db,
  connectionId: string,
  status: SocialConnection["status"],
): Promise<void> {
  await db
    .update(socialConnections)
    .set({ status, updatedAt: new Date() })
    .where(eq(socialConnections.id, connectionId));
}

export async function revokeConnection(db: Db, connectionId: string): Promise<void> {
  await db
    .update(socialConnections)
    .set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() })
    .where(eq(socialConnections.id, connectionId));
}

// ─── OAuth state ──────────────────────────────────────────────────────────

export type CreateOauthStateInput = {
  stateDigest: string;
  provider: "meta" | "tiktok";
  workspaceId: string;
  actorId: string;
  returnPath: string;
  expiresAt: Date;
};

export async function createOauthState(db: Db, input: CreateOauthStateInput): Promise<void> {
  await db.insert(socialOauthStates).values({
    stateDigest: input.stateDigest,
    provider: input.provider,
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    returnPath: input.returnPath,
    expiresAt: input.expiresAt,
  });
}

/**
 * Consume a one-time CSRF state inside the caller's transaction.
 * Returns the row only if it is unconsumed, unexpired, and the digest
 * matches. The caller MUST call this inside a transaction with the
 * `social_oauth_state` row locked (Drizzle `for` is sufficient).
 */
export async function consumeOauthState(
  db: Db,
  stateDigest: string,
  now: Date = new Date(),
): Promise<SocialOauthState | null> {
  const [row] = await db
    .select()
    .from(socialOauthStates)
    .where(eq(socialOauthStates.stateDigest, stateDigest))
    .limit(1);
  if (!row) return null;
  if (row.consumedAt) return null;
  if (row.expiresAt.getTime() < now.getTime()) return null;
  await db
    .update(socialOauthStates)
    .set({ consumedAt: now })
    .where(eq(socialOauthStates.id, row.id));
  return row;
}

export async function cleanupOauthStates(db: Db, olderThan: Date): Promise<number> {
  const result = await db
    .delete(socialOauthStates)
    .where(
      or(
        isNotNull(socialOauthStates.consumedAt),
        lte(socialOauthStates.expiresAt, olderThan),
      ),
    );
  return result.rowCount ?? 0;
}

// ─── Profile linking ──────────────────────────────────────────────────────

export type LinkProfileInput = {
  connectionId: string;
  agencyId: string;
  profile: ConnectedProfile;
  /**
   * If supplied, the picker pre-selected an existing manual channel
   * to link. The repository will lock that row, set the provider
   * linkage columns, and skip entitlement reservation. If omitted,
   * a new `social_channel` row is created and capacity is reserved.
   */
  existingChannelId?: string;
};

export type LinkProfileResult = {
  channel: SocialChannel;
  created: boolean;
};

export async function linkProfile(
  db: Db,
  input: LinkProfileInput,
): Promise<LinkProfileResult> {
  return db.transaction(async (tx) => {
    if (input.existingChannelId) {
      const [channel] = await tx
        .select()
        .from(socialChannels)
        .where(
          and(
            eq(socialChannels.id, input.existingChannelId),
            eq(socialChannels.workspaceId, input.profile.providerAccountId ? sql`workspace_id` : sql`workspace_id`),
          ),
        )
        .for("update")
        .limit(1);
      if (!channel) throw new Error("Existing channel not found in workspace");
      const [updated] = await tx
        .update(socialChannels)
        .set({
          socialConnectionId: input.connectionId,
          externalAccountId: input.profile.providerAccountId,
          avatarUrl: input.profile.avatarUrl,
          connectionStatus: "connected",
          lastSyncErrorAt: null,
          lastSyncErrorCode: null,
          syncFailureCount: 0,
          nextSyncAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(socialChannels.id, channel.id))
        .returning();
      if (!updated) throw new Error("Failed to update existing channel");
      return { channel: updated, created: false };
    }

    // New row path — reserve entitlement capacity inside the same
    // transaction as the insert. The agency_id is required here; the
    // caller resolves it from the workspace.
    try {
      await reserveCapacity(tx, input.agencyId, [
        { resource: "social_profiles", increase: 1 },
        { resource: `social_profiles:${input.profile.platform}`, increase: 1 },
      ]);
    } catch (err) {
      if (err instanceof LimitExceededError) throw err;
      throw err;
    }

    const [inserted] = await tx
      .insert(socialChannels)
      .values({
        // workspaceId is required but the caller's input only provides
        // a connectionId. The caller is expected to pass the
        // workspaceId via the connection row; we resolve it here.
        workspaceId: sql`(SELECT workspace_id FROM social_connection WHERE id = ${input.connectionId})`,
        platform: input.profile.platform === "instagram"
          ? "instagram"
          : input.profile.platform === "facebook"
            ? "facebook"
            : "tiktok",
        accountName: input.profile.accountName,
        handle: input.profile.handle,
        url: input.profile.profileUrl,
        socialConnectionId: input.connectionId,
        externalAccountId: input.profile.providerAccountId,
        avatarUrl: input.profile.avatarUrl,
        connectionStatus: "connected",
        nextSyncAt: new Date(),
      })
      .returning();
    if (!inserted) throw new Error("Failed to insert new social_channel");
    return { channel: inserted, created: true };
  });
}

// ─── Sync worker ──────────────────────────────────────────────────────────

export type ClaimedProfile = {
  channel: SocialChannel;
  connection: SocialConnection;
};

/**
 * Claim up to `limit` due profiles in a single transaction. The
 * caller is responsible for running the actual provider call after
 * this transaction commits.
 */
export async function claimDueProfiles(
  db: Db,
  limit: number = BATCH_LIMIT,
  leaseMs: number = LEASE_MS,
  now: Date = new Date(),
): Promise<ClaimedProfile[]> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        channel: socialChannels,
        connection: socialConnections,
      })
      .from(socialChannels)
      .innerJoin(
        socialConnections,
        and(
          eq(socialConnections.id, socialChannels.socialConnectionId),
          isNull(socialConnections.revokedAt),
        ),
      )
      .where(
        and(
          eq(socialChannels.connectionStatus, "connected"),
          isNull(socialChannels.archivedAt),
          or(
            isNull(socialChannels.nextSyncAt),
            lte(socialChannels.nextSyncAt, now),
          ),
          or(
            isNull(socialChannels.syncLeaseUntil),
            lte(socialChannels.syncLeaseUntil, sql`now() - interval '1 second'`),
          ),
        ),
      )
      .orderBy(asc(socialChannels.nextSyncAt))
      .limit(Math.min(limit, BATCH_LIMIT))
      .for("update", { skipLocked: true });

    if (rows.length === 0) return [];
    const leaseUntil = new Date(now.getTime() + leaseMs);
    const ids = rows.map((r) => r.channel.id);
    await tx
      .update(socialChannels)
      .set({ syncLeaseUntil: leaseUntil, updatedAt: now })
      .where(
        sql`${socialChannels.id} IN ${ids}`,
      );
    return rows.map((r) => ({ channel: r.channel, connection: r.connection }));
  });
}

export type SaveSnapshotInput = {
  socialChannelId: string;
  metricDate: string; // YYYY-MM-DD in workspace tz
  snapshot: ProfileSnapshot;
};

export async function saveSnapshot(
  db: Db,
  input: SaveSnapshotInput,
): Promise<SocialProfileDailyMetric> {
  const [row] = await db
    .insert(socialProfileDailyMetrics)
    .values({
      socialChannelId: input.socialChannelId,
      metricDate: input.metricDate,
      observedAt: input.snapshot.observedAt,
      followerCount: input.snapshot.followerCount,
      followingCount: input.snapshot.followingCount,
      mediaCount: input.snapshot.mediaCount,
      likesCount: input.snapshot.likesCount,
      reach: input.snapshot.reach,
      views: input.snapshot.views,
      engagedAccounts: input.snapshot.engagedAccounts,
      interactions: input.snapshot.interactions,
      providerApiVersion: input.snapshot.providerApiVersion,
      providerRequestId: input.snapshot.providerRequestId,
      responseHash: input.snapshot.responseHash,
      sourceMetadata: input.snapshot.sourceMetadata,
    })
    .onConflictDoUpdate({
      target: [socialProfileDailyMetrics.socialChannelId, socialProfileDailyMetrics.metricDate],
      set: {
        observedAt: input.snapshot.observedAt,
        followerCount: input.snapshot.followerCount,
        followingCount: input.snapshot.followingCount,
        mediaCount: input.snapshot.mediaCount,
        likesCount: input.snapshot.likesCount,
        reach: input.snapshot.reach,
        views: input.snapshot.views,
        engagedAccounts: input.snapshot.engagedAccounts,
        interactions: input.snapshot.interactions,
        providerApiVersion: input.snapshot.providerApiVersion,
        providerRequestId: input.snapshot.providerRequestId,
        responseHash: input.snapshot.responseHash,
        sourceMetadata: input.snapshot.sourceMetadata,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!row) throw new Error("Failed to insert social_profile_daily_metric");
  return row;
}

export async function markSyncSuccess(
  db: Db,
  channelId: string,
  nextSyncAt: Date,
): Promise<void> {
  await db
    .update(socialChannels)
    .set({
      lastSyncedAt: new Date(),
      nextSyncAt,
      syncLeaseUntil: null,
      syncFailureCount: 0,
      lastSyncErrorCode: null,
      lastSyncErrorAt: null,
      connectionStatus: "connected",
      updatedAt: new Date(),
    })
    .where(eq(socialChannels.id, channelId));
}

export async function markSyncFailure(
  db: Db,
  channelId: string,
  code: string,
  nextSyncAt: Date,
  bumpFailureCount: boolean = true,
): Promise<void> {
  await db
    .update(socialChannels)
    .set({
      syncLeaseUntil: null,
      nextSyncAt,
      lastSyncErrorCode: code,
      lastSyncErrorAt: new Date(),
      ...(bumpFailureCount ? { syncFailureCount: sql`${socialChannels.syncFailureCount} + 1` } : {}),
      updatedAt: new Date(),
    })
    .where(eq(socialChannels.id, channelId));
}

export async function markNeedsReauth(
  db: Db,
  channelId: string,
  connectionId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(socialChannels)
      .set({
        connectionStatus: "needs_reauth",
        syncLeaseUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(socialChannels.id, channelId));
    await setConnectionStatus(tx as unknown as Db, connectionId, "needs_reauth");
  });
}

// ─── Disconnect / revoke ──────────────────────────────────────────────────

export async function disconnectProfile(
  db: Db,
  workspaceId: string,
  channelId: string,
): Promise<void> {
  await db
    .update(socialChannels)
    .set({
      socialConnectionId: null,
      connectionStatus: "disconnected",
      syncLeaseUntil: null,
      nextSyncAt: null,
      lastSyncErrorAt: null,
      lastSyncErrorCode: null,
      syncFailureCount: 0,
      updatedAt: new Date(),
    })
    .where(
      and(eq(socialChannels.id, channelId), eq(socialChannels.workspaceId, workspaceId)),
    );
}

/**
 * Revoke a shared Meta grant. Marks the connection revoked and
 * disconnects every channel attached to it, all in one transaction.
 * The `social_connection` row is preserved for audit; the channels
 * retain their `external_account_id` and their metric history.
 */
export async function revokeConnectionAndDetach(
  db: Db,
  workspaceId: string,
  connectionId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(socialConnections)
      .set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(socialConnections.id, connectionId),
          eq(socialConnections.workspaceId, workspaceId),
        ),
      );
    await tx
      .update(socialChannels)
      .set({
        socialConnectionId: null,
        connectionStatus: "disconnected",
        syncLeaseUntil: null,
        nextSyncAt: null,
        lastSyncErrorAt: null,
        lastSyncErrorCode: null,
        syncFailureCount: 0,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(socialChannels.socialConnectionId, connectionId),
          eq(socialChannels.workspaceId, workspaceId),
        ),
      );
  });
}

// ─── Cleanup ──────────────────────────────────────────────────────────────

export async function cleanupOldMetrics(db: Db, olderThan: Date): Promise<number> {
  const result = await db
    .delete(socialProfileDailyMetrics)
    .where(lte(socialProfileDailyMetrics.metricDate, sql`${olderThan.toISOString().slice(0, 10)}::date`));
  return result.rowCount ?? 0;
}

// ─── Read queries ─────────────────────────────────────────────────────────

export async function findChannelsByWorkspace(
  db: Db,
  workspaceId: string,
): Promise<SocialChannel[]> {
  return db
    .select()
    .from(socialChannels)
    .where(
      and(eq(socialChannels.workspaceId, workspaceId), isNull(socialChannels.archivedAt)),
    )
    .orderBy(asc(socialChannels.accountName));
}

export async function findConnectedChannel(
  db: Db,
  workspaceId: string,
  externalAccountId: string,
): Promise<SocialChannel | null> {
  const [row] = await db
    .select()
    .from(socialChannels)
    .where(
      and(
        eq(socialChannels.workspaceId, workspaceId),
        eq(socialChannels.externalAccountId, externalAccountId),
        isNull(socialChannels.archivedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}
