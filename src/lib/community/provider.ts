import type { CommunityCapability, CommunityOperation } from "./capabilities";

/**
 * Messaging is deliberately separate from social analytics. An adapter may
 * expose analytics access through the same connected account, but it must
 * still prove each community operation before the UI or dispatcher can use it.
 */
export type CommunityProvider = "meta";

export type CommunityProviderContext = {
  agencyId: string;
  workspaceId: string;
  connectionId: string;
  provider: CommunityProvider;
};

export type CommunityProviderCursor = {
  value: string | null;
  observedAt: Date;
};

export type CommunityCapabilityDiscovery = {
  capabilities: readonly CommunityCapability[];
  checkedAt: Date;
  providerAccountType?: string;
  providerLoginMode?: string;
  providerVersion?: string;
  evidenceRef?: string;
};

export type CommunityConversationRecord = {
  providerConversationId: string;
  providerRootId: string;
  channel: "instagram" | "facebook";
  kind: "comment" | "private_message";
  postId?: string;
  title?: string;
  participantHandle?: string;
  lastProviderTimestamp: Date;
};

export type CommunityMessageRecord = {
  providerMessageId: string;
  providerConversationId: string;
  providerParentId?: string;
  direction: "inbound" | "outbound";
  visibility: "public" | "private" | "internal";
  body: string;
  providerCreatedAt: Date;
  dedupeKey: string;
};

export type CommunitySendResult =
  | {
      outcome: "sent";
      providerMessageId: string;
      providerResponseRef?: string;
    }
  | {
      outcome: "failed";
      errorCode: string;
      retryable: boolean;
    }
  | {
      outcome: "unknown";
      reconciliationKey: string;
      reason: string;
    };

export type CommunityProviderAdapter = {
  provider: CommunityProvider;
  discoverCapabilities(context: CommunityProviderContext): Promise<CommunityCapabilityDiscovery>;
  readComments(
    context: CommunityProviderContext,
    cursor?: CommunityProviderCursor,
  ): Promise<{
    conversations: readonly CommunityConversationRecord[];
    messages: readonly CommunityMessageRecord[];
    cursor: CommunityProviderCursor;
  }>;
  readPrivateMessages(
    context: CommunityProviderContext,
    cursor?: CommunityProviderCursor,
  ): Promise<{
    conversations: readonly CommunityConversationRecord[];
    messages: readonly CommunityMessageRecord[];
    cursor: CommunityProviderCursor;
  }>;
  replyToComment(
    context: CommunityProviderContext,
    input: { providerConversationId: string; body: string; idempotencyKey: string },
  ): Promise<CommunitySendResult>;
  replyToPrivateMessage(
    context: CommunityProviderContext,
    input: { providerConversationId: string; body: string; idempotencyKey: string },
  ): Promise<CommunitySendResult>;
  reconcileSend(
    context: CommunityProviderContext,
    input: { reconciliationKey: string },
  ): Promise<CommunitySendResult>;
};

export function supportsCommunityOperation(
  discovered: readonly CommunityOperation[],
  operation: CommunityOperation,
): boolean {
  return discovered.includes(operation);
}
