"use server";

import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import {
  workspaces as workspacesTable,
  workspaceSettings as workspaceSettingsTable,
} from "@/lib/db/schema/workspaces";
import { suggestLeadTimes } from "@/lib/ai";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { getActiveApiKey } from "@/lib/ai";
import { hasAnyManagedSecretConfigured } from "@/lib/ai/provider-secret";
import { aiFeatureSettings } from "@/lib/db/schema";

/**
 * Settings AI suggestions (Settings refactor Phase B).
 *
 * Server actions that the per-section forms call when the user
 * clicks "Suggest …". The model returns a JSON-serialisable
 * object the form can drop into its controlled state. Same
 * AI-availability + capability-allowlist gate as
 * /api/ai/generate; the settings actions share the agency's
 * `caption_drafts` capability so a workspace that has AI
 * features enabled for caption drafting also gets lead-time
 * suggestions.
 */
export interface LeadTimeSuggestion {
  contentApprovalLeadDays: number;
  designCompleteLeadDays: number;
  creativeApprovalLeadDays: number;
  readyToPublishLeadDays: number;
}

export interface SuggestLeadTimesResult {
  ok: boolean;
  suggestion?: LeadTimeSuggestion;
  error?: string;
}

export async function suggestLeadTimesAction(
  slug: string,
  context: { approvalMode: "simple" | "internal_then_client" },
): Promise<SuggestLeadTimesResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Sign in again to use AI suggestions." };
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return { ok: false, error: "Workspace not found." };
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"]))) {
    return { ok: false, error: "Workspace manager access is required." };
  }

  // AI gate — mirror /api/ai/generate's capability check.
  const ctx = await resolveActiveAgencyContext({ actor: { id: session.user.id } });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) return { ok: false, error: "Agency not configured." };
  const [feature] = await db
    .select()
    .from(aiFeatureSettings)
    .where(eq(aiFeatureSettings.agencyId, agencyId))
    .limit(1);
  if (!feature?.enabled || !feature.enabledCapabilities.includes("caption_drafts")) {
    return {
      ok: false,
      error: "AI suggestions are disabled in agency settings. Enable Caption drafts to use this.",
    };
  }
  const apiKey = await getActiveApiKey(agencyId);
  if (!apiKey && !hasAnyManagedSecretConfigured()) {
    return { ok: false, error: "AI features are disabled." };
  }

  // Pull a few signals the model can lean on (team size, current
  // target, current approval mode, content cadence hints) and
  // hand them to the prompt. The model returns 4 numbers; we
  // clamp to the same 0-90 / integer-valid shape the form
  // expects so a malformed model output can never land in the
  // database through this path.
  const [settings] = await db
    .select()
    .from(workspaceSettingsTable)
    .where(eq(workspaceSettingsTable.workspaceId, workspace.id))
    .limit(1);
  const [ws] = await db
    .select()
    .from(workspacesTable)
    .where(eq(workspacesTable.id, workspace.id))
    .limit(1);

  try {
    const result = await suggestLeadTimes({
      approvalMode: context.approvalMode,
      timezone: ws?.timezone ?? "UTC",
      monthlyTarget: settings?.monthlyTarget ?? null,
      currentLeadTimes: {
        contentApprovalLeadDays: settings?.contentApprovalLeadDays ?? 10,
        designCompleteLeadDays: settings?.designCompleteLeadDays ?? 5,
        creativeApprovalLeadDays: settings?.creativeApprovalLeadDays ?? 2,
        readyToPublishLeadDays: settings?.readyToPublishLeadDays ?? 1,
      },
      ...(apiKey ? { apiKey } : {}),
    });
    if (!result) return { ok: false, error: "AI returned no result." };
    return { ok: true, suggestion: result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "AI suggestion failed.",
    };
  }
}
