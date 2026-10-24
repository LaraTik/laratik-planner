import "server-only";

import { and, count, eq, gte } from "drizzle-orm";
import type { Actor } from "@/lib/auth/policy";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { aiFeatureSettings, aiUsageEvents } from "@/lib/db/schema";
import { getActiveApiKey } from "@/lib/ai";

export { applyMonthlyProposalAtomically } from "./apply-proposal.server";

/** Read the agency-level AI status in the agency that owns this workspace. */
export async function getWorkspaceAiSettings(
  actor: Actor,
  workspace: { id: string; agencyId: string },
) {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);

  const [featureRows, usageRows, isAdmin, activeApiKey] = await Promise.all([
    db
      .select()
      .from(aiFeatureSettings)
      .where(eq(aiFeatureSettings.agencyId, workspace.agencyId))
      .limit(1),
    db
      .select({ value: count() })
      .from(aiUsageEvents)
      .where(and(eq(aiUsageEvents.workspaceId, workspace.id), gte(aiUsageEvents.createdAt, since)))
      .limit(1),
    isAgencyAdmin(actor, workspace.agencyId),
    getActiveApiKey(workspace.agencyId),
  ]);
  const feature = featureRows[0];
  const usage = usageRows[0];

  return {
    feature: feature ?? null,
    requestCount: usage?.value ?? 0,
    isAdmin,
    hasActiveApiKey: Boolean(activeApiKey),
    effectiveEnabled: Boolean(activeApiKey) && feature?.enabled === true,
    enabledCapabilities: feature?.enabledCapabilities ?? [],
  };
}
