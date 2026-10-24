"use server";

import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspaceAtPath } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import {
  workspaces as workspacesTable,
  workspaceSettings as workspaceSettingsTable,
} from "@/lib/db/schema/workspaces";
import { suggestLeadTimes, suggestMonthlyTarget } from "@/lib/ai";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { getActiveApiKey } from "@/lib/ai";
import { aiFeatureSettings } from "@/lib/db/schema";
import { logError } from "@/lib/observability/logger";
import { z } from "zod";

export const SuggestionErrorCodeSchema = z.enum([
  "invalidInput",
  "unauthenticated",
  "workspaceNotFound",
  "forbidden",
  "agencyMissing",
  "disabled",
  "providerKeyMissing",
  "noResult",
  "failed",
]);
export type SuggestionErrorCode = z.infer<typeof SuggestionErrorCodeSchema>;

const LeadTimeSuggestionInputSchema = z.object({
  approvalMode: z.enum(["simple", "internal_then_client"]),
});

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
  errorCode?: SuggestionErrorCode;
}

export async function suggestLeadTimesAction(
  agencySlug: string,
  slug: string,
  rawContext: unknown,
): Promise<SuggestLeadTimesResult> {
  const context = LeadTimeSuggestionInputSchema.safeParse(rawContext);
  if (!context.success) return { ok: false, errorCode: "invalidInput" };
  const session = await auth();
  if (!session?.user?.id) return { ok: false, errorCode: "unauthenticated" };
  const workspace = await getAccessibleWorkspaceAtPath({ id: session.user.id }, agencySlug, slug);
  if (!workspace) return { ok: false, errorCode: "workspaceNotFound" };
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"]))) {
    return { ok: false, errorCode: "forbidden" };
  }

  // AI gate — mirror /api/ai/generate's capability check.
  const ctx = await resolveActiveAgencyContext({ actor: { id: session.user.id } });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) return { ok: false, errorCode: "agencyMissing" };
  const [feature] = await db
    .select()
    .from(aiFeatureSettings)
    .where(eq(aiFeatureSettings.agencyId, agencyId))
    .limit(1);
  if (!feature?.enabled || !feature.enabledCapabilities.includes("caption_drafts")) {
    return { ok: false, errorCode: "disabled" };
  }
  const apiKey = await getActiveApiKey(agencyId);
  if (!apiKey) return { ok: false, errorCode: "providerKeyMissing" };

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
      approvalMode: context.data.approvalMode,
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
    if (!result) return { ok: false, errorCode: "noResult" };
    return { ok: true, suggestion: result };
  } catch (err) {
    logError("settings.lead_time_suggestion_failed", { err, workspaceId: workspace.id });
    return { ok: false, errorCode: "failed" };
  }
}

export interface SuggestMonthlyTargetResult {
  ok: boolean;
  suggestion?: number;
  errorCode?: SuggestionErrorCode;
}

export async function suggestMonthlyTargetAction(
  agencySlug: string,
  slug: string,
): Promise<SuggestMonthlyTargetResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, errorCode: "unauthenticated" };
  const workspace = await getAccessibleWorkspaceAtPath({ id: session.user.id }, agencySlug, slug);
  if (!workspace) return { ok: false, errorCode: "workspaceNotFound" };
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"]))) {
    return { ok: false, errorCode: "forbidden" };
  }

  const ctx = await resolveActiveAgencyContext({ actor: { id: session.user.id } });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) return { ok: false, errorCode: "agencyMissing" };
  const [feature] = await db
    .select()
    .from(aiFeatureSettings)
    .where(eq(aiFeatureSettings.agencyId, agencyId))
    .limit(1);
  if (!feature?.enabled || !feature.enabledCapabilities.includes("caption_drafts")) {
    return { ok: false, errorCode: "disabled" };
  }
  const apiKey = await getActiveApiKey(agencyId);
  if (!apiKey) return { ok: false, errorCode: "providerKeyMissing" };

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
  const leadTimeTotal =
    (settings?.contentApprovalLeadDays ?? 10) +
    (settings?.designCompleteLeadDays ?? 5) +
    (settings?.creativeApprovalLeadDays ?? 2) +
    (settings?.readyToPublishLeadDays ?? 1);

  try {
    const result = await suggestMonthlyTarget({
      timezone: ws?.timezone ?? "UTC",
      leadTimeTotal,
      approvalMode: (settings?.approvalMode ?? "simple") as "simple" | "internal_then_client",
      ...(apiKey ? { apiKey } : {}),
    });
    if (result === null) return { ok: false, errorCode: "noResult" };
    return { ok: true, suggestion: result };
  } catch (err) {
    logError("settings.monthly_target_suggestion_failed", { err, workspaceId: workspace.id });
    return { ok: false, errorCode: "failed" };
  }
}
