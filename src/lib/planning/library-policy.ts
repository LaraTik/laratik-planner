import "server-only";
import { hasWorkspaceRole, requirePolicy, type Actor } from "@/lib/auth/policy";

/** The planning library uses one manager/planner write boundary for all rows. */
export type PlanningLibraryWriteAction =
  | "create_campaign"
  | "archive_campaign"
  | "create_pillar"
  | "archive_pillar"
  | "restore_pillar"
  | "create_template"
  | "archive_template";

export async function requirePlanningLibraryWrite(
  actor: Actor,
  workspaceId: string,
  action: PlanningLibraryWriteAction,
): Promise<void> {
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, ["workspace_manager", "content_planner"]),
    action,
  );
}
