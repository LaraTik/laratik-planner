"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { workspaceSettings as workspaceSettingsTable } from "@/lib/db/schema/workspaces";
import {
  approvalTemplates,
  leadTimeTemplates,
  monthlyTargetTemplates,
} from "@/lib/workspaces/settings-templates";
import { WORKFLOW_SCENARIOS, type WorkflowScenarioId } from "@/lib/content/workflow";

/**
 * Settings templates (Phase C) — "Apply preset" actions.
 *
 * One-click writes the preset to the workspace's settings
 * row, including the side effects (e.g. applying a client-
 * approval lead-time preset also flips the approvalMode to
 * `internal_then_client` so the workflow matches the buffers).
 */

export interface TemplateApplyResult {
  ok: boolean;
  applied?: number;
  error?: string;
}

async function authedWorkspace(
  slug: string,
): Promise<{ ok: true; workspaceId: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Sign in again to apply presets." };
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return { ok: false, error: "Workspace not found." };
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"]))) {
    return { ok: false, error: "Workspace manager access is required." };
  }
  return { ok: true, workspaceId: workspace.id };
}

export async function applyLeadTimeTemplateAction(
  slug: string,
  templateId: string,
): Promise<TemplateApplyResult> {
  const auth = await authedWorkspace(slug);
  if (!auth.ok) return { ok: false, error: auth.error };
  const tpl = leadTimeTemplates.find((t) => t.id === templateId);
  if (!tpl) return { ok: false, error: "Lead time template not found." };
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(workspaceSettingsTable)
        .set({
          ...tpl.values,
          ...(tpl.forClientApproval ? { approvalMode: "internal_then_client" as const } : {}),
          updatedAt: new Date(),
        })
        .where(eq(workspaceSettingsTable.workspaceId, auth.workspaceId));
    });
  } catch {
    return { ok: false, error: "Could not apply preset." };
  }
  revalidatePath(`/app/w/${slug}/settings`);
  return { ok: true, applied: 1 };
}

export async function applyApprovalTemplateAction(
  slug: string,
  templateId: string,
): Promise<TemplateApplyResult> {
  const auth = await authedWorkspace(slug);
  if (!auth.ok) return { ok: false, error: auth.error };
  const tpl = approvalTemplates.find((t) => t.id === templateId);
  if (!tpl) return { ok: false, error: "Approval template not found." };
  try {
    await db
      .update(workspaceSettingsTable)
      .set({ approvalMode: tpl.id, updatedAt: new Date() })
      .where(eq(workspaceSettingsTable.workspaceId, auth.workspaceId));
  } catch {
    return { ok: false, error: "Could not apply preset." };
  }
  revalidatePath(`/app/w/${slug}/settings`);
  return { ok: true, applied: 1 };
}

export async function applyMonthlyTargetTemplateAction(
  slug: string,
  templateId: string,
): Promise<TemplateApplyResult> {
  const auth = await authedWorkspace(slug);
  if (!auth.ok) return { ok: false, error: auth.error };
  const tpl = monthlyTargetTemplates.find((t) => t.id === templateId);
  if (!tpl) return { ok: false, error: "Monthly target template not found." };
  try {
    await db
      .update(workspaceSettingsTable)
      .set({ monthlyTarget: tpl.value, updatedAt: new Date() })
      .where(eq(workspaceSettingsTable.workspaceId, auth.workspaceId));
  } catch {
    return { ok: false, error: "Could not apply preset." };
  }
  revalidatePath(`/app/w/${slug}/settings`);
  return { ok: true, applied: 1 };
}

/**
 * Apply a workflow scenario to the workspace. Mirrors the pattern of
 * the other `apply*TemplateAction`s (settings-templates Phase C):
 *
 *   - Manager-only (`workspace_manager`).
 *   - One-shot DB write; in-flight items are NOT migrated (the new
 *     scenario filters transitions going forward; existing items
 *     keep their current status).
 *   - Side effect: `lightweight`, `two_gate_client`, and `self_publish`
 *     force `approval_mode` to match the scenario's contract.
 *   - `standard` honours the workspace's existing approvalMode.
 *
 * Result payload includes `applied` (always 1) and `forcedApprovalMode`
 * so the UI can show a confirmation toast like "Applied + approval
 * mode changed to internal_then_client".
 */
export async function applyWorkflowScenarioAction(
  slug: string,
  scenarioId: string,
): Promise<
  TemplateApplyResult & { forcedApprovalMode?: "simple" | "internal_then_client" | null }
> {
  const auth = await authedWorkspace(slug);
  if (!auth.ok) return { ok: false, error: auth.error };
  const scenario = WORKFLOW_SCENARIOS[scenarioId as WorkflowScenarioId];
  if (!scenario) {
    return { ok: false, error: "Unknown workflow scenario." };
  }
  // Resolve the forced approval mode for the side-effect hint. We
  // don't write `null` — `standard` keeps the workspace's existing
  // approvalMode unchanged.
  const forcedApprovalMode =
    scenario.approvalMode === "single"
      ? "simple"
      : scenario.approvalMode === "two_gate"
        ? "internal_then_client"
        : null;
  try {
    await db.transaction(async (tx) => {
      const patch: {
        workflowScenario: string;
        approvalMode?: "simple" | "internal_then_client";
        updatedAt: Date;
      } = {
        workflowScenario: scenario.id,
        updatedAt: new Date(),
      };
      if (forcedApprovalMode) {
        patch.approvalMode = forcedApprovalMode;
      }
      await tx
        .update(workspaceSettingsTable)
        .set(patch)
        .where(eq(workspaceSettingsTable.workspaceId, auth.workspaceId));
    });
  } catch {
    return { ok: false, error: "Could not apply scenario." };
  }
  // Revalidate every surface that renders the scenario: planning
  // list/detail, board, settings.
  revalidatePath(`/app/w/${slug}/settings`);
  revalidatePath(`/app/w/${slug}/settings/templates`);
  revalidatePath(`/app/w/${slug}/planning`);
  revalidatePath(`/app/w/${slug}/board`);
  return {
    ok: true,
    applied: 1,
    ...(forcedApprovalMode !== null ? { forcedApprovalMode } : {}),
  };
}
