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
import { readMetaCommunityPrivateMessages } from "./meta-community-reader";
import { isProviderReply, syncedMessageState } from "./comment-sync-state";
import { advanceSyncCursor } from "./sync-state";

const SYNC_OVERLAP_MS = 2 * 60 * 1000;

function overlapCursor(value: string | null | undefined): Date | null {
  if (!value) return null;
  const cursor = new Date(value);
  if (Number.isNaN(cursor.getTime())) return null;
  return new Date(cursor.getTime() - SYNC_OVERLAP_MS);
}

async function markPrivateSyncStarted(workspaceId: string, socialConnectionId: string) {
  const now = new Date();
  const claimed = await db
    .insert(communitySyncStates)
    .values({
      workspaceId,
      socialConnectionId,
      syncKind: "private_messages",
      status: "running",
      lastStartedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [communitySyncStates.socialConnectionId, communitySyncStates.syncKind],
      set: {
        status: "running",
        lastStartedAt: now,
        lastErrorCode: null,
        lastErrorAt: null,
        updatedAt: now,
      },
      where: sql`${communitySyncStates.status} <> 'running'`,
    })
    .returning({ id: communitySyncStates.id });
  return claimed.length > 0;
}

export type CommunityPrivateMessageSyncResult = {
  readChannels: number;
  insertedMessages: number;
  skippedChannels: number;
  failures: string[];
  completedAt: Date;
};

function safeErrorCode(error: unknown): string {
  if (error instanceof SocialProviderError) return error.code;
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return "sync_failed";
}

async function persistPrivateMessage(
  workspaceId: string,
  channel: typeof socialChannels.$inferSelect,
  message: Awaited<ReturnType<typeof readMetaCommunityPrivateMessages>>["messages"][number],
): Promise<boolean> {
  const providerReply = isProviderReply(message.authorExternalId, channel.externalAccountId);
  const messageState = syncedMessageState(providerReply);
  const [conversation] = await db
    .insert(communityConversations)
    .values({
      workspaceId,
      socialChannelId: channel.id,
      provider: "meta",
      channelType: message.metadata.platform,
      externalConversationId: message.externalConversationId,
      externalRootId: message.externalConversationId,
      state: messageState.conversationState,
      lastMessageAt: message.postedAt,
      metadata: message.metadata,
      updatedAt: message.postedAt,
    })
    .onConflictDoUpdate({
      target: [
        communityConversations.workspaceId,
        communityConversations.provider,
        communityConversations.externalConversationId,
      ],
      set: {
        socialChannelId: channel.id,
        state: sql`CASE
          WHEN ${communityConversations.lastMessageAt} IS NULL
            OR ${communityConversations.lastMessageAt} <= ${message.postedAt}
          THEN ${messageState.conversationState}
          ELSE ${communityConversations.state}
        END`,
        lastMessageAt: sql`GREATEST(COALESCE(${communityConversations.lastMessageAt}, ${message.postedAt}), ${message.postedAt})`,
        metadata: message.metadata,
        updatedAt: message.postedAt,
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
      externalMessageId: message.externalMessageId,
      direction: messageState.direction,
      visibility: "private",
      body: message.body,
      authorName: message.authorName,
      authorExternalId: message.authorExternalId,
      deliveryState: messageState.deliveryState,
      postedAt: message.postedAt,
      metadata: message.metadata,
      updatedAt: message.postedAt,
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

export async function syncMetaCommunityPrivateMessages(
  agencyId: string,
  workspaceId: string,
): Promise<CommunityPrivateMessageSyncResult> {
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
        eq(communityCapabilities.operation, "read_private_messages"),
        eq(communityCapabilities.state, "available"),
      ),
    );
  const readableConnections = new Set(capabilityRows.map((row) => row.socialConnectionId));
  const syncRows = await db
    .select({
      socialConnectionId: communitySyncStates.socialConnectionId,
      syncKind: communitySyncStates.syncKind,
      cursor: communitySyncStates.cursor,
    })
    .from(communitySyncStates)
    .where(eq(communitySyncStates.workspaceId, workspaceId));
  const cursorByConnection = new Map(
    syncRows.map((row) => [`${row.socialConnectionId}:${row.syncKind}`, row.cursor] as const),
  );
  const cache = createDekCache(db);
  let readChannels = 0;
  let insertedMessages = 0;
  let skippedChannels = 0;
  const failures: string[] = [];
  for (const row of channels) {
    if (!readableConnections.has(row.connection.id)) {
      skippedChannels += 1;
      continue;
    }
    if (row.channel.platform !== "facebook" && row.channel.platform !== "instagram") {
      skippedChannels += 1;
      continue;
    }
    if (!row.channel.externalAccountId) {
      skippedChannels += 1;
      continue;
    }
    try {
      if (!(await markPrivateSyncStarted(workspaceId, row.connection.id))) {
        skippedChannels += 1;
        continue;
      }
      const dek = await getDekForWorkspace(db, cache, workspaceId);
      const credentials = openConnectionCredentials(row.connection, dek);
      const accessToken =
        credentials.profileAccessTokens?.[row.channel.externalAccountId] ?? credentials.accessToken;
      const result = await readMetaCommunityPrivateMessages({
        platform: row.channel.platform,
        accountId: row.channel.externalAccountId,
        accessToken,
        apiVersion: config.graphApiVersion,
        since: overlapCursor(cursorByConnection.get(`${row.connection.id}:private_messages`)),
      });
      readChannels += 1;
      for (const message of result.messages) {
        if (await persistPrivateMessage(workspaceId, row.channel, message)) insertedMessages += 1;
      }
      const completedAt = new Date();
      await db
        .update(communitySyncStates)
        .set({
          status: "idle",
          cursor: advanceSyncCursor(
            "private_messages",
            cursorByConnection.get(`${row.connection.id}:private_messages`),
            result.messages.map((message) => message.postedAt),
          ),
          lastCompletedAt: completedAt,
          lastErrorCode: null,
          updatedAt: completedAt,
        })
        .where(
          and(
            eq(communitySyncStates.workspaceId, workspaceId),
            eq(communitySyncStates.socialConnectionId, row.connection.id),
            eq(communitySyncStates.syncKind, "private_messages"),
          ),
        );
    } catch (error) {
      const errorCode = safeErrorCode(error);
      failures.push(errorCode);
      const failedAt = new Date();
      await db
        .update(communitySyncStates)
        .set({
          status: "failed",
          lastErrorCode: errorCode,
          lastErrorAt: failedAt,
          updatedAt: failedAt,
        })
        .where(
          and(
            eq(communitySyncStates.workspaceId, workspaceId),
            eq(communitySyncStates.socialConnectionId, row.connection.id),
            eq(communitySyncStates.syncKind, "private_messages"),
          ),
        );
    }
  }
  const completedAt = new Date();
  await db.insert(communityEvents).values({
    workspaceId,
    kind: "community_private_messages_sync_completed",
    detail:
      failures.length > 0
        ? "community_private_messages_sync_completed_with_errors"
        : "community_private_messages_sync_completed",
    metadata: { readChannels, insertedMessages, skippedChannels, failureCount: failures.length },
    createdAt: completedAt,
  });
  return { readChannels, insertedMessages, skippedChannels, failures, completedAt };
}
