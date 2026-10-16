"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { getAccessibleWorkspaceAtPath } from "@/lib/workspaces/context";
import { workspaceBasePath } from "@/lib/urls";
import { CommunityAccessError, requireCommunityPermission } from "./service";
import { validateCommunityCapabilities } from "./capability-service";

export type CommunityCapabilityActionResult =
  | {
      ok: true;
      checkedConnections: number;
      checkedChannels: number;
      availableOperations: number;
    }
  | {
      ok: false;
      errorCode:
        "session_required" | "workspace_not_found" | "permission_denied" | "validation_failed";
    };

export async function validateCommunityCapabilitiesAction(
  agencySlug: string,
  workspaceSlug: string,
): Promise<CommunityCapabilityActionResult> {
  const session = await auth();
  const actor = await currentActor();
  if (!session?.user?.id || !actor) return { ok: false, errorCode: "session_required" };

  const workspace = await getAccessibleWorkspaceAtPath(actor, agencySlug, workspaceSlug);
  if (!workspace) return { ok: false, errorCode: "workspace_not_found" };

  try {
    await requireCommunityPermission(actor, workspace, "manage_connections");
    const result = await validateCommunityCapabilities(workspace.agencyId, workspace.id);
    revalidatePath(`${workspaceBasePath(agencySlug, workspaceSlug)}/engagement/connections`);
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof CommunityAccessError) {
      return {
        ok: false,
        errorCode: error.code === "permission_denied" ? "permission_denied" : "validation_failed",
      };
    }
    return { ok: false, errorCode: "validation_failed" };
  }
}
