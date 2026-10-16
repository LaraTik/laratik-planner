import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  communityCapabilities,
  communityConversations,
  communityEvents,
  communityMessages,
  communitySyncStates,
  socialChannels,
  socialConnections,
} from "@/lib/db/schema";
import { getAgencyProviderConfig } from "@/lib/social/provider-config";
import { createDekCache, getDekForWorkspace } from "@/lib/social/key-management";
import { openConnectionCredentials } from "@/lib/social/repository";
import { SocialProviderError } from "@/lib/social/http";
import { readMetaCommunityComments } from "./meta-community-reader";
import { isProviderReply, syncedMessageState } from "./comment-sync-state";

export type CommunityCommentSyncResult = {
  checkedConnections: number;
  readChannels: number;
  insertedMessages: number;
  skippedChannels: number;
  failures: string[];
  completedAt: Date;
};

const SYNC_OVERLAP_MS = 2 * 60 * 1000;

function overlapCursor(value: string | null | undefined): Date | null {
  if (!value) return null;
  const cursor = new Date(value);
  if (Number.isNaN(cursor.getTime())) return null;
  return new Date(cursor.getTime() - SYNC_OVERLAP_MS);
}

function safeErrorCode(error: unknown): string {
  if (error instanceof SocialProviderError) return error.code;
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return "sync_failed";
}

async function markSyncStarted(workspaceId: string, socialConnectionId: string): Promise<boolean> {
  const now = new Date();
  const claimed = await db
    .insert(communitySyncStates)
    .values({
      workspaceId,
      socialConnectionId,
      status: "running",
      lastStartedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: communitySyncStates.socialConnectionId,
      set: {
        status: "running",
        lastStartedAt: now,
        lastErrorCode: null,
        lastErrorAt: null,
        updatedAt: now,
      },
      // Manual sync is at-least-once, but two clicks must not create two
      // overlapping provider reads. The condition makes the claim atomic.
      where: sql`${communitySyncStates.status} <> 'running'`,
    })
    .returning({ id: communitySyncStates.id });
  return claimed.length > 0;
}

async function markSyncCompleted(
  workspaceId: string,
  socialConnectionId: string,
  cursor: string | null,
): Promise<void> {
  const now = new Date();
  await db
    .update(communitySyncStates)
    .set({
      status: "idle",
      cursor,
      lastCompletedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(communitySyncStates.workspaceId, workspaceId),
        eq(communitySyncStates.socialConnectionId, socialConnectionId),
      ),
    );
}

async function markSyncFailed(
  workspaceId: string,
  socialConnectionId: string,
  errorCode: string,
): Promise<void> {
  const now = new Date();
  await db
    .update(communitySyncStates)
    .set({ status: "failed", lastErrorCode: errorCode, lastErrorAt: now, updatedAt: now })
    .where(
      and(
        eq(communitySyncStates.workspaceId, workspaceId),
        eq(communitySyncStates.socialConnectionId, socialConnectionId),
      ),
    );
}

async function persistComment(
  workspaceId: string,
  channel: typeof socialChannels.$inferSelect,
  comment: Awaited<ReturnType<typeof readMetaCommunityComments>>["comments"][number],
): Promise<boolean> {
  // Meta returns comments written by the connected Page/Instagram account in
  // the same feed as customer comments. Treat an owned comment as an
  // outbound provider-confirmed reply so a sync never asks the operator to
  // answer a conversation that Meta already answered.
  const providerReply = isProviderReply(comment.authorExternalId, channel.externalAccountId);
  const messageState = syncedMessageState(providerReply);
  const [conversation] = await db
    .insert(communityConversations)
    .values({
      workspaceId,
      socialChannelId: channel.id,
      provider: "meta",
      channelType: comment.metadata.platform,
      externalConversationId: comment.externalRootId,
      externalRootId: comment.externalRootId,
      externalPostId: comment.externalPostId,
      state: "open",
      lastMessageAt: comment.postedAt,
      metadata: comment.metadata,
      updatedAt: comment.postedAt,
    })
    .onConflictDoUpdate({
      target: [
        communityConversations.workspaceId,
        communityConversations.provider,
        communityConversations.externalConversationId,
      ],
      set: {
        socialChannelId: channel.id,
        externalRootId: comment.externalRootId,
        externalPostId: comment.externalPostId,
        state: sql`CASE
          WHEN ${communityConversations.lastMessageAt} IS NULL
            OR ${communityConversations.lastMessageAt} <= ${comment.postedAt}
          THEN ${messageState.conversationState}
          ELSE ${communityConversations.state}
        END`,
        lastMessageAt: sql`GREATEST(COALESCE(${communityConversations.lastMessageAt}, ${comment.postedAt}), ${comment.postedAt})`,
        metadata: comment.metadata,
        updatedAt: comment.postedAt,
      },
    })
    .returning({ id: communityConversations.id });

  if (!conversation) return false;
  const inserted = await db
    .insert(communityMessages)
    .values({
      workspaceId,
      conversationId: conversation.id,
      provider: "meta",
      externalMessageId: comment.externalMessageId,
      direction: messageState.direction,
      visibility: "public",
      body: comment.body,
      authorName: comment.authorName,
      authorExternalId: comment.authorExternalId,
      externalParentId: comment.externalParentId,
      deliveryState: messageState.deliveryState,
      postedAt: comment.postedAt,
      metadata: comment.metadata,
      updatedAt: comment.postedAt,
    })
    .onConflictDoNothing({
      target: [
        communityMessages.workspaceId,
        communityMessages.provider,
        communityMessages.externalMessageId,
      ],
    })
    .returning({ id: communityMessages.id });
  return inserted.length > 0;
}

export async function syncMetaCommunityComments(
  agencyId: string,
  workspaceId: string,
): Promise<CommunityCommentSyncResult> {
  const channels = await db
    .select({ channel: socialChannels, connection: socialConnections })
    .from(socialChannels)
    .innerJoin(
      socialConnections,
      and(
        eq(socialConnections.id, socialChannels.socialConnectionId),
        eq(socialConnections.workspaceId, workspaceId),
        eq(socialConnections.provider, "meta"),
        eq(socialConnections.status, "active"),
        isNull(socialConnections.revokedAt),
      ),
    )
    .where(
      and(
        eq(socialChannels.workspaceId, workspaceId),
        eq(socialChannels.connectionStatus, "connected"),
        eq(socialChannels.isActive, true),
        isNull(socialChannels.archivedAt),
      ),
    );
  const config = await getAgencyProviderConfig(db, agencyId, "meta");
  if (!("appId" in config) || !config.enabled) throw new Error("provider_not_configured");

  const capabilityRows = await db
    .select({ socialConnectionId: communityCapabilities.socialConnectionId })
    .from(communityCapabilities)
    .where(
      and(
        eq(communityCapabilities.workspaceId, workspaceId),
        eq(communityCapabilities.operation, "read_comments"),
        eq(communityCapabilities.state, "available"),
      ),
    );
  const readableConnections = new Set(capabilityRows.map((row) => row.socialConnectionId));
  const syncRows = await db
    .select({
      socialConnectionId: communitySyncStates.socialConnectionId,
      cursor: communitySyncStates.cursor,
    })
    .from(communitySyncStates)
    .where(eq(communitySyncStates.workspaceId, workspaceId));
  const cursorByConnection = new Map(
    syncRows.map((row) => [row.socialConnectionId, row.cursor] as const),
  );
  const cache = createDekCache(db);
  const byConnection = new Map<string, (typeof channels)[number][]>();
  for (const row of channels) {
    const list = byConnection.get(row.connection.id) ?? [];
    list.push(row);
    byConnection.set(row.connection.id, list);
  }

  let readChannels = 0;
  let insertedMessages = 0;
  let skippedChannels = 0;
  const failures: string[] = [];
  for (const [connectionId, rows] of byConnection) {
    if (!readableConnections.has(connectionId)) {
      skippedChannels += rows.length;
      continue;
    }
    if (!(await markSyncStarted(workspaceId, connectionId))) {
      skippedChannels += rows.length;
      continue;
    }
    const connection = rows[0]?.connection;
    if (!connection) continue;
    try {
      const dek = await getDekForWorkspace(db, cache, workspaceId);
      const credentials = openConnectionCredentials(connection, dek);
      let latestTimestamp: Date | null = null;
      for (const row of rows) {
        if (row.channel.platform !== "facebook" && row.channel.platform !== "instagram") {
          skippedChannels += 1;
          continue;
        }
        if (!row.channel.externalAccountId) {
          skippedChannels += 1;
          continue;
        }
        const accessToken =
          credentials.profileAccessTokens?.[row.channel.externalAccountId] ??
          credentials.accessToken;
        const result = await readMetaCommunityComments({
          platform: row.channel.platform,
          accountId: row.channel.externalAccountId,
          accessToken,
          apiVersion: config.graphApiVersion,
          since: overlapCursor(cursorByConnection.get(connectionId)),
        });
        readChannels += 1;
        for (const comment of result.comments) {
          if (!latestTimestamp || comment.postedAt > latestTimestamp)
            latestTimestamp = comment.postedAt;
          if (await persistComment(workspaceId, row.channel, comment)) insertedMessages += 1;
        }
      }
      await markSyncCompleted(
        workspaceId,
        connectionId,
        latestTimestamp?.toISOString() ?? cursorByConnection.get(connectionId) ?? null,
      );
    } catch (error) {
      const errorCode = safeErrorCode(error);
      failures.push(errorCode);
      await markSyncFailed(workspaceId, connectionId, errorCode);
    }
  }

  const completedAt = new Date();
  await db.insert(communityEvents).values({
    workspaceId,
    kind: "community_comments_sync_completed",
    detail:
      failures.length > 0
        ? "community_comments_sync_completed_with_errors"
        : "community_comments_sync_completed",
    metadata: { readChannels, insertedMessages, skippedChannels, failureCount: failures.length },
    createdAt: completedAt,
  });
  return {
    checkedConnections: byConnection.size,
    readChannels,
    insertedMessages,
    skippedChannels,
    failures,
    completedAt,
  };
}
