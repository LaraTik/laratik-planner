import "server-only";

import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";

/**
 * Resolve the active, agency-scoped workspace once for research endpoints.
 * Callers translate a null result into their stable HTTP error contract.
 */
export async function getResearchContext(workspaceSlug: string) {
  const actor = await currentActor();
  if (!actor) return null;
  const agency = await resolveActiveAgencyContext({ actor });
  if (!agency) return null;
  const workspace = await getAccessibleWorkspace(actor, workspaceSlug, agency.agencyId);
  if (!workspace) return null;
  return { actor, workspace };
}
