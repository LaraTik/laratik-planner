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

type CapabilityRow = {
  operation: string;
  state: string;
  checkedAt: Date | null;
  detail: string | null;
};

const CAPABILITY_STATE_PRIORITY: Record<string, number> = {
  unavailable: 0,
  unknown: 1,
  available: 2,
};

/**
 * A workspace can retain more than one active provider connection while an
 * account is being refreshed. The UI must present the best validated result
 * for each operation, rather than whichever connection the database returns
 * first. An available result wins over unknown/unavailable; ties use the
 * newest check so stale diagnostics do not mask a fresh validation.
 */
export function mergeCapabilityRows<T extends CapabilityRow>(rows: readonly T[]): T[] {
  const merged = new Map<string, T>();
  for (const row of rows) {
    const current = merged.get(row.operation);
    if (!current) {
      merged.set(row.operation, row);
      continue;
    }
    const currentPriority = CAPABILITY_STATE_PRIORITY[current.state] ?? -1;
    const nextPriority = CAPABILITY_STATE_PRIORITY[row.state] ?? -1;
    const currentTime = current.checkedAt?.getTime() ?? 0;
    const nextTime = row.checkedAt?.getTime() ?? 0;
    if (
      nextPriority > currentPriority ||
      (nextPriority === currentPriority && nextTime > currentTime)
    ) {
      merged.set(row.operation, row);
    }
  }
  return Array.from(merged.values());
}

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
