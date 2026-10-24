"use server";

import { eq } from "drizzle-orm";
import {} from "next/cache";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspaceAtPath } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { workspaceSettings as workspaceSettingsTable } from "@/lib/db/schema/workspaces";
import {
  approvalTemplates,
  leadTimeTemplates,
  monthlyTargetTemplates,
} from "@/lib/workspaces/settings-templates";
import { applyWorkflowScenario } from "@/features/content/server";

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
  agencySlug: string,
  slug: string,
): Promise<{ ok: true; workspaceId: string; actorId: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Sign in again to apply presets." };
  const workspace = await getAccessibleWorkspaceAtPath({ id: session.user.id }, agencySlug, slug);
  if (!workspace) return { ok: false, error: "Workspace not found." };
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"]))) {
    return { ok: false, error: "Workspace manager access is required." };
  }
  return { ok: true, workspaceId: workspace.id, actorId: session.user.id };
}

export async function applyLeadTimeTemplateAction(
  agencySlug: string,
  slug: string,
  templateId: string,
): Promise<TemplateApplyResult> {
  const auth = await authedWorkspace(agencySlug, slug);
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
  return { ok: true, applied: 1 };
}

export async function applyApprovalTemplateAction(
  agencySlug: string,
  slug: string,
  templateId: string,
): Promise<TemplateApplyResult> {
  const auth = await authedWorkspace(agencySlug, slug);
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
  return { ok: true, applied: 1 };
}

export async function applyMonthlyTargetTemplateAction(
  agencySlug: string,
  slug: string,
  templateId: string,
): Promise<TemplateApplyResult> {
  const auth = await authedWorkspace(agencySlug, slug);
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
  agencySlug: string,
  slug: string,
  scenarioId: string,
): Promise<
  TemplateApplyResult & { forcedApprovalMode?: "simple" | "internal_then_client" | null }
> {
  const auth = await authedWorkspace(agencySlug, slug);
  if (!auth.ok) return { ok: false, error: auth.error };
  const outcome = await applyWorkflowScenario({ id: auth.actorId }, auth.workspaceId, scenarioId);
  return outcome.ok
    ? { ...outcome, forcedApprovalMode: outcome.forcedApprovalMode ?? null }
    : outcome;
}
