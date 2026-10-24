import "server-only";
import { AgencyNotFoundError, getEffectiveEntitlement } from "@/lib/entitlements";
import { COMMUNITY_INBOX_MODULE } from "./access";

/** Resolve plan inclusion while allowing real entitlement-service failures to surface. */
export async function isCommunityInboxPlanIncluded(agencyId: string): Promise<boolean> {
  try {
    const entitlement = await getEffectiveEntitlement({ agencyId });
    return entitlement.enabledModules?.has(COMMUNITY_INBOX_MODULE) ?? false;
  } catch (error) {
    if (error instanceof AgencyNotFoundError) return false;
    throw error;
  }
}
