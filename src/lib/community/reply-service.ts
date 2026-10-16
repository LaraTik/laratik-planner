import "server-only";

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  communityCapabilities,
  communityConversations,
  communityEvents,
  communityMessages,
  communitySendAttempts,
  socialChannels,
  socialConnections,
} from "@/lib/db/schema";
import { getAgencyProviderConfig } from "@/lib/social/provider-config";
import { createDekCache, getDekForWorkspace } from "@/lib/social/key-management";
import { openConnectionCredentials } from "@/lib/social/repository";
import { SocialProviderError } from "@/lib/social/http";
import { getCommunityWorkspaceAccess } from "./service";
import {
  replyToMetaComment,
  replyToMetaPrivateMessage,
  type MetaCommunityReplyResult,
} from "./meta-community-writer";

type ReplyVisibility = "public" | "private";

export type CommunityReplyResult =
  | { ok: true; state: "sent"; providerMessageId: string }
  | {
      ok: false;
      code:
        | "invalid_body"
        | "not_found"
        | "permission_denied"
        | "module_unavailable"
        | "emergency_stop"
        | "capability_unavailable"
        | "recipient_missing"
        | "already_processing"
        | "unknown_outcome"
        | "provider_failed";
    };

type ConversationMetadata = {
  participantExternalId?: unknown;
};

function participantExternalId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as ConversationMetadata).participantExternalId;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function idempotencyKey(conversationId: string, visibility: ReplyVisibility, body: string): string {
  const digest = createHash("sha256")
    .update(`${conversationId}\n${visibility}\n${body}`)
    .digest("hex");
  return `community-reply:${conversationId}:${visibility}:${digest}`;
}

function providerFailureState(error: unknown): "unknown" | "failed" {
  return error instanceof SocialProviderError && error.retryable ? "unknown" : "failed";
}

function providerErrorCode(error: unknown): string {
  if (error instanceof SocialProviderError) return error.code;
  return "provider_failed";
}

async function sendProviderReply(args: {
  visibility: ReplyVisibility;
  platform: "facebook" | "instagram";
  accountId: string;
  commentId: string;
  recipientId: string | null;
  body: string;
  accessToken: string;
  apiVersion: string | null;
}): Promise<MetaCommunityReplyResult> {
  if (args.visibility === "public") {
    return replyToMetaComment({
      platform: args.platform,
      commentId: args.commentId,
      body: args.body,
      accessToken: args.accessToken,
      apiVersion: args.apiVersion,
    });
  }
  if (!args.recipientId) throw new Error("recipient_missing");
  return replyToMetaPrivateMessage({
    platform: args.platform,
    accountId: args.accountId,
    recipientId: args.recipientId,
    body: args.body,
    accessToken: args.accessToken,
    apiVersion: args.apiVersion,
  });
}

/**
 * Send a human-authored community reply after re-checking every mutable
 * boundary immediately before dispatch. The provider call is deliberately
 * outside the DB transaction; the send-attempt state records whether a
 * confirmation was received so an unknown outcome is never retried blindly.
 */
export async function sendCommunityReply(args: {
  actorId: string;
  agencyId: string;
  workspaceId: string;
  conversationId: string;
  body: string;
  visibility: ReplyVisibility;
}): Promise<CommunityReplyResult> {
  const body = args.body.trim();
  if (body.length === 0 || body.length > 5000) return { ok: false, code: "invalid_body" };

  const access = await getCommunityWorkspaceAccess(args.agencyId, args.workspaceId);
  if (!access.allowed) return { ok: false, code: "module_unavailable" };
  if (access.emergencyStop) return { ok: false, code: "emergency_stop" };

  const [row] = await db
    .select({
      conversation: communityConversations,
      channel: socialChannels,
      connection: socialConnections,
    })
    .from(communityConversations)
    .leftJoin(socialChannels, eq(socialChannels.id, communityConversations.socialChannelId))
    .leftJoin(socialConnections, eq(socialConnections.id, socialChannels.socialConnectionId))
    .where(
      and(
        eq(communityConversations.id, args.conversationId),
        eq(communityConversations.workspaceId, args.workspaceId),
        eq(communityConversations.provider, "meta"),
      ),
    )
    .limit(1);
  if (
    !row?.channel ||
    !row.connection ||
    row.connection.status !== "active" ||
    row.connection.revokedAt
  ) {
    return { ok: false, code: "not_found" };
  }
  const channel = row.channel;
  const connection = row.connection;
  if (channel.platform !== "facebook" && channel.platform !== "instagram") {
    return { ok: false, code: "capability_unavailable" };
  }
  if (!channel.externalAccountId) return { ok: false, code: "capability_unavailable" };

  const operation = args.visibility === "public" ? "reply_comments" : "reply_private_messages";
  const [capability] = await db
    .select({ state: communityCapabilities.state })
    .from(communityCapabilities)
    .where(
      and(
        eq(communityCapabilities.workspaceId, args.workspaceId),
        eq(communityCapabilities.socialConnectionId, connection.id),
        eq(communityCapabilities.operation, operation),
      ),
    )
    .limit(1);
  if (capability?.state !== "available") return { ok: false, code: "capability_unavailable" };

  const key = idempotencyKey(args.conversationId, args.visibility, body);
  const [created] = await db
    .insert(communitySendAttempts)
    .values({
      workspaceId: args.workspaceId,
      conversationId: args.conversationId,
      operation,
      idempotencyKey: key,
      state: "sending",
      attemptedAt: new Date(),
    })
    .onConflictDoNothing({
      target: [communitySendAttempts.workspaceId, communitySendAttempts.idempotencyKey],
    })
    .returning({ id: communitySendAttempts.id, state: communitySendAttempts.state });
  const attempt =
    created ??
    (
      await db
        .select({ id: communitySendAttempts.id, state: communitySendAttempts.state })
        .from(communitySendAttempts)
        .where(
          and(
            eq(communitySendAttempts.workspaceId, args.workspaceId),
            eq(communitySendAttempts.idempotencyKey, key),
          ),
        )
        .limit(1)
    )[0];
  if (!attempt) return { ok: false, code: "provider_failed" };
  if (attempt.state === "sent" || attempt.state === "reconciled") {
    return { ok: false, code: "already_processing" };
  }
  if (attempt.state === "sending" && !created) {
    return { ok: false, code: "already_processing" };
  }
  if (attempt.state === "unknown") return { ok: false, code: "unknown_outcome" };
  if (attempt.state === "failed") {
    await db
      .update(communitySendAttempts)
      .set({ state: "sending", errorCode: null, errorDetail: null, attemptedAt: new Date() })
      .where(eq(communitySendAttempts.id, attempt.id));
  }

  const config = await getAgencyProviderConfig(db, args.agencyId, "meta");
  if (!("appId" in config) || !config.enabled) {
    await db
      .update(communitySendAttempts)
      .set({ state: "failed", errorCode: "provider_not_configured" })
      .where(eq(communitySendAttempts.id, attempt.id));
    return { ok: false, code: "provider_failed" };
  }

  try {
    const cache = createDekCache(db);
    const dek = await getDekForWorkspace(db, cache, args.workspaceId);
    const credentials = openConnectionCredentials(connection, dek);
    const accessToken =
      credentials.profileAccessTokens?.[channel.externalAccountId] ?? credentials.accessToken;
    const result = await sendProviderReply({
      visibility: args.visibility,
      platform: channel.platform,
      accountId: channel.externalAccountId,
      commentId: row.conversation.externalRootId ?? row.conversation.externalConversationId,
      recipientId:
        args.visibility === "private" ? participantExternalId(row.conversation.metadata) : null,
      body,
      accessToken,
      apiVersion: config.graphApiVersion,
    });
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(communitySendAttempts)
        .set({ state: "sent", providerRequestId: result.requestId, attemptedAt: now })
        .where(eq(communitySendAttempts.id, attempt.id));
      await tx
        .insert(communityMessages)
        .values({
          workspaceId: args.workspaceId,
          conversationId: args.conversationId,
          provider: "meta",
          externalMessageId: result.providerMessageId,
          direction: "outgoing",
          visibility: args.visibility,
          body,
          authorExternalId: channel.externalAccountId,
          externalParentId: args.visibility === "public" ? row.conversation.externalRootId : null,
          deliveryState: "sent",
          postedAt: now,
          metadata: { platform: channel.platform, providerRequestId: result.requestId },
          updatedAt: now,
        })
        .onConflictDoNothing({
          target: [
            communityMessages.workspaceId,
            communityMessages.provider,
            communityMessages.externalMessageId,
          ],
        });
      await tx
        .update(communityConversations)
        .set({ state: "waiting_customer", lastMessageAt: now, updatedAt: now })
        .where(
          and(
            eq(communityConversations.id, args.conversationId),
            eq(communityConversations.workspaceId, args.workspaceId),
          ),
        );
      await tx.insert(communityEvents).values({
        workspaceId: args.workspaceId,
        conversationId: args.conversationId,
        actorId: args.actorId,
        kind: "community_reply_sent",
        detail: "community_reply_sent",
        metadata: { operation, providerRequestId: result.requestId },
        createdAt: now,
      });
    });
    return { ok: true, state: "sent", providerMessageId: result.providerMessageId };
  } catch (error) {
    const state = providerFailureState(error);
    await db
      .update(communitySendAttempts)
      .set({
        state,
        errorCode: providerErrorCode(error),
        errorDetail: error instanceof SocialProviderError ? error.providerMessage : null,
      })
      .where(eq(communitySendAttempts.id, attempt.id));
    await db.insert(communityEvents).values({
      workspaceId: args.workspaceId,
      conversationId: args.conversationId,
      actorId: args.actorId,
      kind: "community_reply_failed",
      detail: state === "unknown" ? "community_reply_unknown_outcome" : "community_reply_failed",
      metadata: { operation, errorCode: providerErrorCode(error), state },
      createdAt: new Date(),
    });
    return { ok: false, code: state === "unknown" ? "unknown_outcome" : "provider_failed" };
  }
}
