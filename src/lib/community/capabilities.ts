export const COMMUNITY_OPERATIONS = [
  "read_comments",
  "reply_comments",
  "read_private_messages",
  "reply_private_messages",
  "webhooks",
  "media_context",
  "conversation_history",
] as const;

export type CommunityOperation = (typeof COMMUNITY_OPERATIONS)[number];
export type CommunityCapability = CommunityOperation;
export type CommunityCapabilityState = "available" | "unavailable" | "unknown";

export function capabilityAvailability(
  discovered: readonly CommunityCapability[] | null | undefined,
  operation: CommunityOperation,
): CommunityCapabilityState {
  if (discovered === undefined || discovered === null) return "unknown";
  return discovered.includes(operation) ? "available" : "unavailable";
}
