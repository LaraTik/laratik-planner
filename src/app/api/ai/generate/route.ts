import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { currentActor } from "@/lib/auth/current-actor";
import { db } from "@/lib/db";
import { aiFeatureSettings, aiUsageEvents, contentItems, workspaces } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  checkCompleteness,
  draftCaption,
  getActiveApiKey,
  improveBrief,
  isAiEnabled,
  type ChatResult,
} from "@/lib/ai";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { publicProviderError } from "@/lib/security/public-error";
import { randomUUID } from "node:crypto";
import { serverEnv } from "@/lib/validation/env";
import { logError } from "@/lib/observability/logger";
import { getEffectiveEntitlement, LimitExceededError } from "@/lib/entitlements";
import { recordUsage } from "@/lib/usage";
import { enforceAiBudget, reconcileAiBudget } from "@/lib/ai/governance";
import { hasAnyManagedSecretConfigured } from "@/lib/ai/provider-secret";

/**
 * POST /api/ai/generate
 *
 * Body: { contentItemId, capability? }
 *   - capability: one of the §15 capabilities
 *       "caption_drafts"        (default — backwards compatible)
 *       "brief_improvement"
 *       "completeness_check"
 *       "platform_adaptation"   (not yet implemented)
 *       "campaign_ideas"        (not yet implemented)
 *       "related_format_ideas"  (not yet implemented)
 *
 * Auth: signed in + workspace member with manager or planner role.
 * The agency feature-settings `enabledCapabilities` allowlist is the
 * authoritative gate; the route refuses a capability that is off.
 *
 * Returns a draft text only — the user is responsible for saving it
 * (we never auto-write to the DB — master prompt §0.13 "AI never
 * bypasses human control"). The route also writes a usage event with
 * the capability name so the agency-level usage card can break down
 * counts by capability.
 */
const Body = z.object({
  contentItemId: z.string().uuid(),
  capability: z
    .enum([
      "caption_drafts",
      "brief_improvement",
      "completeness_check",
      "platform_adaptation",
      "campaign_ideas",
      "related_format_ideas",
    ])
    .optional()
    .default("caption_drafts"),
});

export async function POST(req: NextRequest) {
  // M3.4 — key resolution is per-agency. We resolve it after the
  // agency context is known so a managed secret in the DB takes
  // priority over the env key. The 503 here is the "neither
  // configured" path; the 200 paths exercise the resolved key.
  if (!isAiEnabled() && !(await hasAnyManagedSecretConfigured())) {
    return NextResponse.json(
      {
        error:
          "AI features are disabled. Set a managed secret at /app/agency-settings/ai or set AI_FEATURE_ENABLED=true and MINIMAX_API_KEY in the environment.",
      },
      { status: 503 },
    );
  }

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const ctx = await resolveActiveAgencyContext({ actor });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) return NextResponse.json({ error: "Agency not configured" }, { status: 409 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const requestId = req.headers.get("x-request-id") ?? undefined;
  const limit = await enforceRateLimit({
    scope: "ai_generation",
    subject: session.user.id,
    actorId: session.user.id,
    ...(requestId ? { requestId } : {}),
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many AI requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  // Capability allowlist — refuse if the agency has not enabled it.
  const [feature] = await db
    .select()
    .from(aiFeatureSettings)
    .where(eq(aiFeatureSettings.agencyId, agencyId))
    .limit(1);
  const allowed = new Set(feature?.enabledCapabilities ?? []);
  if (!feature?.enabled || !allowed.has(parsed.data.capability)) {
    return NextResponse.json(
      {
        error: `Capability "${parsed.data.capability}" is disabled in agency settings.`,
      },
      { status: 403 },
    );
  }
  const entitlement = await getEffectiveEntitlement({ agencyId });
  if (!entitlement.enabledAiCapabilities.has(parsed.data.capability)) {
    return NextResponse.json(
      { error: `Capability "${parsed.data.capability}" is not included in this plan.` },
      { status: 403 },
    );
  }
  if (
    parsed.data.capability === "platform_adaptation" ||
    parsed.data.capability === "campaign_ideas" ||
    parsed.data.capability === "related_format_ideas"
  ) {
    return NextResponse.json(
      { error: `Capability "${parsed.data.capability}" is not yet implemented.` },
      { status: 501 },
    );
  }

  const [item] = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, parsed.data.contentItemId))
    .limit(1);
  if (!item) return NextResponse.json({ error: "Content not found" }, { status: 404 });

  // Get workspace slug for the platform hint
  const [ws] = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(and(eq(workspaces.id, item.workspaceId), eq(workspaces.agencyId, agencyId)))
    .limit(1);
  if (!ws) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  if (
    !(await hasWorkspaceRole({ id: session.user.id }, ws.id, [
      "workspace_manager",
      "content_planner",
    ]))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let reservedTokens: { input: number; output: number } | null = null;
  try {
    const estimatedInput = Math.max(
      1,
      Math.ceil(`${item.title}\n${item.brief}\n${item.format}\n${ws.name}`.length / 4),
    );
    const outputReservation = Math.max(
      1,
      Math.min(600, entitlement.maxOutputTokensPerRequest ?? 600),
    );
    const usageRequestId = requestId ?? randomUUID();
    // M3.4 — resolve the active API key for this agency. A
    // managed secret in the DB takes priority; the env key is
    // the fallback. The 503 above covers the "neither" case.
    const apiKey = await getActiveApiKey(agencyId);
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "No AI API key configured for this agency. Set a managed secret at /app/agency-settings/ai or set MINIMAX_API_KEY in the environment.",
        },
        { status: 503 },
      );
    }
    // M3.3 — server-authoritative AI budget enforcement. The
    // per-user daily counter is upserted inside the same
    // transaction as the monthly reservation, so concurrent
    // requests from the same user cannot exceed the cap. The
    // upsert and the monthly reservation are atomic; a
    // LimitExceededError rolls both back.
    await db.transaction(async (tx) => {
      await enforceAiBudget({
        tx,
        agencyId,
        userId: session.user.id,
        capability: parsed.data.capability,
        estimatedInputTokens: estimatedInput,
        estimatedOutputTokens: outputReservation,
        requestId: usageRequestId,
      });
    });
    reservedTokens = { input: estimatedInput, output: outputReservation };
    let providerUsage: ChatResult | null = null;
    const baseInput = {
      title: item.title,
      brief: item.brief,
      format: item.format,
      audience: ws.name,
      maxTokens: outputReservation,
      apiKey,
      onUsage: (usage: ChatResult) => {
        providerUsage = usage;
      },
    };
    let text: string | null = null;
    switch (parsed.data.capability) {
      case "caption_drafts":
        text = await draftCaption(baseInput);
        break;
      case "brief_improvement":
        text = await improveBrief(baseInput);
        break;
      case "completeness_check":
        text = await checkCompleteness(baseInput);
        break;
      default:
        return NextResponse.json({ error: "Unknown capability" }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ error: "AI returned no result" }, { status: 502 });
    }
    const actualInput = (providerUsage as ChatResult | null)?.inputTokens ?? estimatedInput;
    const actualOutput = (providerUsage as ChatResult | null)?.outputTokens ?? outputReservation;
    // M3.3 — reconcile the per-request reservation against the
    // provider's actual token usage. Idempotent and atomic; the
    // daily counter is left alone (it counts requests, not
    // tokens). The monthly input + output counters are trued up
    // in a single transaction.
    await reconcileAiBudget({
      agencyId,
      userId: session.user.id,
      estimatedInputTokens: estimatedInput,
      estimatedOutputTokens: outputReservation,
      actualInputTokens: actualInput,
      actualOutputTokens: actualOutput,
    });
    reservedTokens = { input: actualInput, output: actualOutput };
    await db.insert(aiUsageEvents).values({
      agencyId,
      workspaceId: ws.id,
      contentItemId: item.id,
      userId: session.user.id,
      capability: parsed.data.capability,
      model: serverEnv.MINIMAX_MODEL,
      inputTokens: actualInput,
      outputTokens: actualOutput,
      requestId: usageRequestId,
      succeeded: true,
      contextManifest: { categories: ["title", "brief", "format", "workspace_name"] },
    });
    return NextResponse.json({ text, capability: parsed.data.capability });
  } catch (e) {
    if (e instanceof LimitExceededError) {
      return NextResponse.json({ error: e.message, quota: e.details }, { status: 429 });
    }
    if (reservedTokens) {
      await Promise.allSettled([
        recordUsage(db, agencyId, "ai_input_tokens_month", -reservedTokens.input),
        recordUsage(db, agencyId, "ai_output_tokens_month", -reservedTokens.output),
      ]);
    }
    await db
      .insert(aiUsageEvents)
      .values({
        agencyId,
        workspaceId: ws.id,
        contentItemId: item.id,
        userId: session.user.id,
        capability: parsed.data.capability,
        model: serverEnv.MINIMAX_MODEL,
        inputTokens: 0,
        outputTokens: 0,
        requestId: requestId ?? randomUUID(),
        succeeded: false,
        contextManifest: { categories: ["title", "brief", "format", "workspace_name"] },
      })
      .catch(() => undefined);
    logError("ai.provider_failed", {
      cause: e,
      requestId,
      userId: session.user.id,
      workspaceId: ws.id,
    });
    return NextResponse.json({ error: publicProviderError("ai", e).message }, { status: 502 });
  }
}
