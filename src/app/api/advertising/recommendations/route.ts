import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentActor } from "@/lib/auth/current-actor";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { db } from "@/lib/db";
import { aiUsageEvents } from "@/lib/db/schema";
import { getEffectiveEntitlement } from "@/lib/entitlements";
import {
  advertisingRecommendations,
  getActiveApiKey,
  loadEnabledCapabilities,
  type ChatResult,
} from "@/lib/ai";
import { enforceAiBudget, reconcileAiBudget } from "@/lib/ai/governance";
import {
  buildBudgetPacingInsights,
  buildCampaignPerformanceInsights,
  buildCreativeFatigueInsights,
} from "@/lib/advertising/intelligence";
import { loadAdvertisingReport } from "@/lib/advertising/reporting-query";
import { buildAdvertisingReportView } from "@/lib/advertising/reporting-view";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { serverEnv } from "@/lib/validation/env";
import { recordUsage } from "@/lib/usage";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  accountId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  since: z.string().date(),
  until: z.string().date(),
});

const RecommendationResponse = z.object({
  schemaVersion: z.literal(1),
  recommendations: z
    .array(
      z.object({
        title: z.string().min(1).max(240),
        action: z.string().min(1).max(500),
        rationale: z.string().min(1).max(800),
        evidence: z.array(z.string().min(1).max(300)).max(6),
        confidence: z.enum(["high", "medium", "low"]),
      }),
    )
    .max(8),
  limitations: z.array(z.string().min(1).max(500)).max(12),
});

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: mutatingApiHeaders() });
}

/**
 * Generate advisory recommendations from the same tenant-authorized,
 * read-only advertising projection used by the dashboard. This route never
 * writes campaign state, budgets, content, or publishing state.
 */
export async function POST(request: NextRequest) {
  if (!serverEnv.ADVERTISING_REPORTING_ENABLED) {
    return errorResponse("advertising_reporting_disabled", 404);
  }
  const actor = await currentActor();
  if (!actor) return errorResponse("not_signed_in", 401);
  const agencyContext = await resolveActiveAgencyContext({ actor });
  if (!agencyContext) return errorResponse("agency_context_unavailable", 404);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.since > parsed.data.until) {
    return errorResponse("invalid_recommendation_query", 400);
  }
  if (
    new Date(`${parsed.data.until}T00:00:00Z`).getTime() -
      new Date(`${parsed.data.since}T00:00:00Z`).getTime() >
    93 * 24 * 60 * 60 * 1000
  ) {
    return errorResponse("recommendation_range_limited", 400);
  }
  if (
    !(await hasWorkspaceRole({ id: actor.id }, parsed.data.workspaceId, [
      "workspace_manager",
      "content_planner",
    ]))
  ) {
    return errorResponse("forbidden", 403);
  }

  const capabilities = await loadEnabledCapabilities(agencyContext.agencyId);
  if (!capabilities.has("advertising_recommendations")) {
    return errorResponse("advertising_recommendations_disabled", 403);
  }

  const result = await loadAdvertisingReport(db, {
    actor,
    agencyId: agencyContext.agencyId,
    workspaceId: parsed.data.workspaceId,
    accountId: parsed.data.accountId,
    since: parsed.data.since,
    until: parsed.data.until,
    surface: "ai_context",
  });
  if (result.kind !== "ok") return errorResponse("advertising_report_not_found", 404);

  const view = buildAdvertisingReportView(result.report.rows, result.objects);
  const payload = {
    summary: result.report.totals,
    campaigns: buildCampaignPerformanceInsights(view.campaigns),
    budgetPacing: buildBudgetPacingInsights(view.campaigns, parsed.data.since, parsed.data.until),
    creativeFatigue: buildCreativeFatigueInsights(
      result.report.rows,
      view.ads,
      parsed.data.since,
      parsed.data.until,
    ),
    paidOrganic: view.promotedPosts ?? [],
  };

  const limit = await enforceRateLimit({
    scope: "ai_generation",
    subject: actor.id,
    actorId: actor.id,
    ...(request.headers.get("x-request-id")
      ? { requestId: request.headers.get("x-request-id")! }
      : {}),
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many AI requests. Please try again shortly." },
      {
        status: 429,
        headers: { ...mutatingApiHeaders(), "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  const apiKey = await getActiveApiKey(agencyContext.agencyId);
  if (!apiKey) return errorResponse("ai_provider_not_configured", 503);
  const entitlement = await getEffectiveEntitlement({ agencyId: agencyContext.agencyId });
  const outputReservation = Math.max(
    1,
    Math.min(900, entitlement.maxOutputTokensPerRequest ?? 900),
  );
  const inputPayload = JSON.stringify(payload);
  const estimatedInput = Math.max(1, Math.ceil(inputPayload.length / 4));
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  let reservedTokens: { input: number; output: number } | null = null;
  const providerUsageRef: { current: ChatResult | null } = { current: null };

  try {
    await db.transaction(async (tx) => {
      await enforceAiBudget({
        tx,
        agencyId: agencyContext.agencyId,
        userId: actor.id,
        capability: "advertising_recommendations",
        estimatedInputTokens: estimatedInput,
        estimatedOutputTokens: outputReservation,
        requestId,
      });
    });
    reservedTokens = { input: estimatedInput, output: outputReservation };

    const raw = await advertisingRecommendations({
      accountName: result.account.name,
      period: { since: parsed.data.since, until: parsed.data.until },
      partial: result.partial,
      ...payload,
      apiKey,
      maxTokens: outputReservation,
      onUsage: (usage) => {
        providerUsageRef.current = usage;
      },
    });
    if (!raw) throw new Error("ai_empty_result");
    const parsedResponse = parseProviderJson(raw);
    if (!parsedResponse.success) throw new Error("ai_invalid_result");

    const actualInput = providerUsageRef.current?.inputTokens ?? estimatedInput;
    const actualOutput = providerUsageRef.current?.outputTokens ?? outputReservation;
    await reconcileAiBudget({
      agencyId: agencyContext.agencyId,
      userId: actor.id,
      estimatedInputTokens: estimatedInput,
      estimatedOutputTokens: outputReservation,
      actualInputTokens: actualInput,
      actualOutputTokens: actualOutput,
    });
    reservedTokens = null;
    await db.insert(aiUsageEvents).values({
      agencyId: agencyContext.agencyId,
      workspaceId: parsed.data.workspaceId,
      contentItemId: null,
      userId: actor.id,
      capability: "advertising_recommendations",
      model: serverEnv.MINIMAX_MODEL,
      inputTokens: actualInput,
      outputTokens: actualOutput,
      requestId,
      succeeded: true,
      contextManifest: {
        categories: [
          "advertising_report",
          "campaign_performance",
          "budget_pacing",
          "creative_fatigue",
          "paid_organic",
        ],
      },
    });
    return NextResponse.json(
      {
        ...parsedResponse.data,
        capability: "advertising_recommendations",
        partial: result.partial,
        freshness: result.freshness,
      },
      { headers: mutatingApiHeaders() },
    );
  } catch (error) {
    if (reservedTokens) {
      await Promise.allSettled([
        recordUsage(db, agencyContext.agencyId, "ai_input_tokens_month", -reservedTokens.input),
        recordUsage(db, agencyContext.agencyId, "ai_output_tokens_month", -reservedTokens.output),
      ]);
    }
    await db
      .insert(aiUsageEvents)
      .values({
        agencyId: agencyContext.agencyId,
        workspaceId: parsed.data.workspaceId,
        contentItemId: null,
        userId: actor.id,
        capability: "advertising_recommendations",
        model: serverEnv.MINIMAX_MODEL,
        inputTokens: 0,
        outputTokens: 0,
        requestId,
        succeeded: false,
        contextManifest: {
          categories: [
            "advertising_report",
            "campaign_performance",
            "budget_pacing",
            "creative_fatigue",
            "paid_organic",
          ],
        },
      })
      .catch(() => undefined);
    if (error instanceof Error && error.message === "ai_empty_result") {
      return errorResponse("ai_empty_result", 502);
    }
    if (error instanceof Error && error.message === "ai_invalid_result") {
      return errorResponse("ai_invalid_result", 502);
    }
    return error instanceof Error && error.message.includes("exceeded")
      ? errorResponse("ai_quota_exceeded", 429)
      : errorResponse("ai_provider_failed", 502);
  }
}

function parseProviderJson(raw: string) {
  try {
    return RecommendationResponse.safeParse(JSON.parse(raw));
  } catch {
    return RecommendationResponse.safeParse(null);
  }
}
