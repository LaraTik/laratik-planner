export type SyncedCommentDirection = "incoming" | "outgoing";
export type SyncedConversationState = "open" | "waiting_customer";

/**
 * Meta includes comments authored by the connected Page/Instagram account in
 * the same collection as customer comments. Keeping this decision in a pure
 * helper makes the sync rule explicit and testable without touching the DB.
 */
export function isProviderReply(
  authorExternalId: string | null,
  providerAccountId: string | null,
): boolean {
  return Boolean(providerAccountId) && authorExternalId === providerAccountId;
}

export function syncedMessageState(isReply: boolean): {
  direction: SyncedCommentDirection;
  conversationState: SyncedConversationState;
  deliveryState: "received" | "sent";
} {
  return isReply
    ? { direction: "outgoing", conversationState: "waiting_customer", deliveryState: "sent" }
    : { direction: "incoming", conversationState: "open", deliveryState: "received" };
}
