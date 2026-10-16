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

/**
 * Capability probes may be merged across several Meta channels. Keep the
 * first stable provider reason so the UI can render a useful explanation even
 * when multiple channels report the same limitation.
 */
export function firstCapabilityDetail(detail: string | null | undefined): string | undefined {
  return detail
    ?.split(",")
    .map((value) => value.trim())
    .find((value) => value.length > 0);
}

export function missingCapabilityScopes(detail: string | null | undefined): string[] {
  const first = firstCapabilityDetail(detail);
  if (!first?.startsWith("missing_scope:")) return [];
  return first
    .slice("missing_scope:".length)
    .split("|")
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
}

export function capabilityAvailability(
  discovered: readonly CommunityCapability[] | null | undefined,
  operation: CommunityOperation,
): CommunityCapabilityState {
  if (discovered === undefined || discovered === null) return "unknown";
  return discovered.includes(operation) ? "available" : "unavailable";
}
