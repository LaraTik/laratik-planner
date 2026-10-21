import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaceSettings } from "@/lib/db/schema";
import { hasWorkspaceRole, type Actor } from "@/lib/auth/policy";
import { WORKFLOW_SCENARIOS, type WorkflowScenarioId } from "@/lib/content/workflow";

export type ApplyWorkflowScenarioResult =
  | { ok: false; error: string }
  | {
      ok: true;
      applied: 1;
      forcedApprovalMode?: "simple" | "internal_then_client";
    };

/** Apply a validated workflow scenario through the shared manager-only path. */
export async function applyWorkflowScenario(
  actor: Actor,
  workspaceId: string,
  scenarioId: string,
): Promise<ApplyWorkflowScenarioResult> {
  if (!(await hasWorkspaceRole(actor, workspaceId, ["workspace_manager"]))) {
    return { ok: false, error: "Workspace manager access is required." };
  }
  const scenario = WORKFLOW_SCENARIOS[scenarioId as WorkflowScenarioId];
  if (!scenario) return { ok: false, error: "Unknown workflow scenario." };

  const forcedApprovalMode =
    scenario.approvalMode === "single"
      ? "simple"
      : scenario.approvalMode === "two_gate"
        ? "internal_then_client"
        : undefined;
  try {
    await db.transaction(async (tx) => {
      const patch: {
        workflowScenario: string;
        approvalMode?: "simple" | "internal_then_client";
        updatedAt: Date;
      } = { workflowScenario: scenario.id, updatedAt: new Date() };
      if (forcedApprovalMode) patch.approvalMode = forcedApprovalMode;
      await tx
        .update(workspaceSettings)
        .set(patch)
        .where(eq(workspaceSettings.workspaceId, workspaceId));
    });
  } catch {
    return { ok: false, error: "Could not apply scenario." };
  }
  return {
    ok: true,
    applied: 1,
    ...(forcedApprovalMode ? { forcedApprovalMode } : {}),
  };
}
