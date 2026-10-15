export const COMMUNITY_INBOX_MODULE = "community_inbox" as const;

export type CommunityModule = typeof COMMUNITY_INBOX_MODULE;

export type CommunityAccessReason =
  "enabled" | "plan_not_included" | "agency_disabled" | "workspace_disabled" | "permission_denied";

export interface CommunityInboxAccessInput {
  planModules: readonly string[] | null | undefined;
  agencyEnabled: boolean | null | undefined;
  workspaceEnabled: boolean | null | undefined;
}

export interface CommunityInboxAccessResult {
  allowed: boolean;
  reason: CommunityAccessReason;
}

/**
 * The feature gate is intentionally pure so every route and server action can
 * share the same fail-closed decision without reimplementing precedence.
 */
export function evaluateCommunityInboxAccess(
  input: CommunityInboxAccessInput,
): CommunityInboxAccessResult {
  if (!input.planModules?.includes(COMMUNITY_INBOX_MODULE)) {
    return { allowed: false, reason: "plan_not_included" };
  }
  if (input.agencyEnabled !== true) {
    return { allowed: false, reason: "agency_disabled" };
  }
  if (input.workspaceEnabled !== true) {
    return { allowed: false, reason: "workspace_disabled" };
  }
  return { allowed: true, reason: "enabled" };
}
