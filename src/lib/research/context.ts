import "server-only";

import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
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

/** Resolve a workspace and enforce the shared research mutation roles. */
export async function getResearchManagerContext(workspaceSlug: string) {
  const ctx = await getResearchContext(workspaceSlug);
  if (!ctx) return { error: "workspace_not_accessible" as const };
  if (
    !(await hasWorkspaceRole(ctx.actor, ctx.workspace.id, ["workspace_manager", "content_planner"]))
  ) {
    return { error: "forbidden" as const };
  }
  return ctx;
}
