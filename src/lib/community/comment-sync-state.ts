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

/**
 * A reply form must not dispatch a second provider message while the latest
 * confirmed message is already authored by the connected account. The
 * conversation state is included so a later customer message can reopen the
 * thread and allow a legitimate follow-up.
 */
export function providerReplyIsLatest(input: {
  conversationState: string;
  latestDirection: string | null | undefined;
  latestDeliveryState: string | null | undefined;
  latestAuthorExternalId: string | null | undefined;
  providerAccountId: string;
}): boolean {
  return (
    input.conversationState === "waiting_customer" &&
    input.latestDirection === "outgoing" &&
    (input.latestDeliveryState === "sent" || input.latestDeliveryState === "reconciled") &&
    input.latestAuthorExternalId === input.providerAccountId
  );
}
