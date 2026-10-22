import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { currentActor } from "@/lib/auth/current-actor";
import { getAccessibleWorkspaceAtPath } from "@/lib/workspaces/context";
import { CommunityAccessError, requireCommunityPermission } from "@/lib/community/service";
import {
  CommunityTestLabInputSchema,
  blockedCommunityTestLabResult,
  containsCommunityPromptInjection,
  prepareCommunityTestLabInput,
  runCommunityTestLab,
} from "@/lib/community/ai-test-lab";
import { db } from "@/lib/db";
import { aiFeatureSettings } from "@/lib/db/schema";
import {
  enforceAiBudget,
  getActiveApiKey,
  loadEnabledCapabilities,
  reconcileAiBudget,
  releaseAiBudgetReservation,
  recordAiUsageEvent,
  type ChatResult,
} from "@/lib/ai";
import { getEffectiveEntitlement, LimitExceededError } from "@/lib/entitlements";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { serverEnv } from "@/lib/validation/env";
import { captureError } from "@/lib/observability/sentry";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  agencySlug: z.string().trim().min(1).max(80),
  workspaceSlug: z.string().trim().min(1).max(80),
  ...CommunityTestLabInputSchema.shape,
});

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: mutatingApiHeaders() });
}

/**
 * Run the Community Test Lab without ever calling a provider adapter. The
 * only external call this route can make is the configured MiniMax model call
 * for a preview draft; the result is never persisted or dispatched.
 */
export async function POST(request: NextRequest) {
  const actor = await currentActor();
  if (!actor) return errorResponse("not_signed_in", 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("invalid_test_lab_input", 400);

  const workspace = await getAccessibleWorkspaceAtPath(
    actor,
    parsed.data.agencySlug,
    parsed.data.workspaceSlug,
  );
  if (!workspace) return errorResponse("workspace_not_found", 404);

  try {
    await requireCommunityPermission(actor, workspace, "review_ai_drafts");
  } catch (error) {
    if (error instanceof CommunityAccessError) {
      return errorResponse(error.code === "permission_denied" ? "forbidden" : error.code, 403);
    }
    return errorResponse("community_access_unavailable", 403);
  }

  const testInput = prepareCommunityTestLabInput({
    channel: parsed.data.channel,
    message: parsed.data.message,
    scenario: parsed.data.scenario,
  });

  // Injection-blocked requests are deterministic and do not consume provider
  // budget. They still return the complete preview contract to the UI.
  if (containsCommunityPromptInjection(testInput)) {
    return NextResponse.json(
      { result: blockedCommunityTestLabResult(), previewOnly: true },
      { headers: mutatingApiHeaders() },
    );
  }

  const [feature] = await db
    .select({
      enabled: aiFeatureSettings.enabled,
      enabledCapabilities: aiFeatureSettings.enabledCapabilities,
    })
    .from(aiFeatureSettings)
    .where(eq(aiFeatureSettings.agencyId, workspace.agencyId))
    .limit(1);

  // The feature row is checked again below through the same database-backed
  // governance path used by the other AI routes. This route intentionally
  // does not infer enablement from the presence of a provider key.
  if (!feature?.enabled || !feature.enabledCapabilities.includes("community_reply_drafts")) {
    return errorResponse("community_reply_drafts_disabled", 403);
  }

  const capabilities = await loadEnabledCapabilities(workspace.agencyId);
  if (!capabilities.has("community_reply_drafts")) {
    return errorResponse("community_reply_drafts_not_in_plan", 403);
  }

  const limit = await enforceRateLimit({
    scope: "ai_generation",
    subject: actor.id,
    actorId: actor.id,
    ...(request.headers.get("x-request-id")
      ? { requestId: request.headers.get("x-request-id") as string }
      : {}),
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "ai_rate_limited" },
      {
        status: 429,
        headers: { ...mutatingApiHeaders(), "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  const apiKey = await getActiveApiKey(workspace.agencyId);
  if (!apiKey) return errorResponse("ai_provider_not_configured", 503);

  const entitlement = await getEffectiveEntitlement({ agencyId: workspace.agencyId });
  const outputReservation = Math.max(
    1,
    Math.min(800, entitlement.maxOutputTokensPerRequest ?? 800),
  );
  const estimatedInput = Math.max(
    1,
    Math.ceil(`${testInput.channel}\n${testInput.message}\n${testInput.scenario}`.length / 4),
  );
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  let reserved = false;
  let providerUsage: ChatResult | null = null;

  try {
    await db.transaction(async (tx) => {
      await enforceAiBudget({
        tx,
        agencyId: workspace.agencyId,
        userId: actor.id,
        capability: "community_reply_drafts",
        estimatedInputTokens: estimatedInput,
        estimatedOutputTokens: outputReservation,
        requestId,
      });
    });
    reserved = true;

    const run = await runCommunityTestLab({
      testInput,
      apiKey,
      maxTokens: outputReservation,
      onUsage: (usage) => {
        providerUsage = usage;
      },
    });
    if (!run.providerUsed) {
      throw new Error("community_test_lab_provider_unavailable");
    }

    const usage = providerUsage as ChatResult | null;
    const actualInput = usage?.inputTokens ?? estimatedInput;
    const actualOutput = usage?.outputTokens ?? outputReservation;
    await reconcileAiBudget({
      agencyId: workspace.agencyId,
      userId: actor.id,
      estimatedInputTokens: estimatedInput,
      estimatedOutputTokens: outputReservation,
      actualInputTokens: actualInput,
      actualOutputTokens: actualOutput,
    });
    reserved = false;

    await recordAiUsageEvent({
      agencyId: workspace.agencyId,
      workspaceId: workspace.id,
      userId: actor.id,
      capability: "community_reply_drafts",
      model: serverEnv.MINIMAX_MODEL,
      inputTokens: actualInput,
      outputTokens: actualOutput,
      requestId,
      succeeded: true,
      contextCategories: ["community_message", "community_scenario", "simulation_only"],
    });

    return NextResponse.json(
      { result: run.result, previewOnly: true },
      { headers: mutatingApiHeaders() },
    );
  } catch (error) {
    if (error instanceof LimitExceededError) {
      return NextResponse.json(
        { error: "ai_quota_exceeded", quota: error.details },
        { status: 429, headers: mutatingApiHeaders() },
      );
    }
    if (reserved) {
      const released = await releaseAiBudgetReservation({
        agencyId: workspace.agencyId,
        inputTokens: estimatedInput,
        outputTokens: outputReservation,
      });
      if (!released)
        captureError(
          "ai.budget_release_failed",
          new Error("Failed to release AI token reservation"),
          { requestId, userId: actor.id, workspaceId: workspace.id },
        );
    }
    await recordAiUsageEvent({
      agencyId: workspace.agencyId,
      workspaceId: workspace.id,
      userId: actor.id,
      capability: "community_reply_drafts",
      model: serverEnv.MINIMAX_MODEL,
      inputTokens: 0,
      outputTokens: 0,
      requestId,
      succeeded: false,
      contextCategories: ["community_message", "community_scenario", "simulation_only"],
    }).catch(() => undefined);
    return errorResponse("community_test_lab_failed", 502);
  }
}
