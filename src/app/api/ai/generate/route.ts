import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { hasWorkspaceRole, requireWriteCapability } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { currentActor } from "@/lib/auth/current-actor";
import { db } from "@/lib/db";
import { aiFeatureSettings, aiUsageEvents, contentItems, workspaces } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  campaignIdeas,
  checkCompleteness,
  draftCaption,
  getActiveApiKey,
  improveBrief,
  isAiEnabled,
  platformAdapt,
  relatedFormatIdeas,
  splitVariants,
  type ChatResult,
} from "@/lib/ai";
import { loadAiContext, isContextMeaningful } from "@/lib/ai/context";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { publicProviderError } from "@/lib/security/public-error";
import { randomUUID } from "node:crypto";
import { serverEnv } from "@/lib/validation/env";
import { captureError } from "@/lib/observability/sentry";
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
  /**
   * For `platform_adaptation` — the target platform the user wants
   * the source caption adapted for (e.g. "x", "linkedin", "tiktok").
   * Ignored for every other capability.
   */
  targetPlatform: z.string().trim().min(1).max(40).optional(),
  /**
   * For `platform_adaptation` — the source caption text the planner
   * is starting from. The content item's own brief is the fallback
   * when the caller doesn't supply one.
   */
  sourceText: z.string().max(4000).optional(),
  // Per master prompt §15, the user selects which context to include
  // before generation. The basic fields (title / brief / format /
  // workspace_name) are always included; the toggles below are
  // additive. The route logs the actual categories used so audit +
  // governance review can detect under-inclusion (the previous
  // implementation hard-coded the same 4 categories regardless of
  // selection — GAP-FULL-REVIEW-2026-08-25 / FEAT-05).
  contextSelection: z
    .object({
      brandKit: z.boolean().optional().default(false),
      campaign: z.boolean().optional().default(false),
      pillars: z.boolean().optional().default(false),
      channels: z.boolean().optional().default(false),
      approvedContent: z.boolean().optional().default(false),
    })
    .optional()
    .default({}),
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
      { status: 503, headers: mutatingApiHeaders() },
    );
  }

  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json(
      { error: "Not signed in" },
      { status: 401, headers: mutatingApiHeaders() },
    );
  const actor = await currentActor();
  if (!actor)
    return NextResponse.json(
      { error: "Not signed in" },
      { status: 401, headers: mutatingApiHeaders() },
    );

  const ctx = await resolveActiveAgencyContext({ actor });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId)
    return NextResponse.json(
      { error: "Agency not configured" },
      { status: 409, headers: mutatingApiHeaders() },
    );

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid body" },
      { status: 400, headers: mutatingApiHeaders() },
    );

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
      {
        status: 429,
        headers: { ...mutatingApiHeaders(), "Retry-After": String(limit.retryAfterSeconds) },
      },
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
      { status: 403, headers: mutatingApiHeaders() },
    );
  }
  const entitlement = await getEffectiveEntitlement({ agencyId });
  if (!entitlement.enabledAiCapabilities.has(parsed.data.capability)) {
    return NextResponse.json(
      { error: `Capability "${parsed.data.capability}" is not included in this plan.` },
      { status: 403, headers: mutatingApiHeaders() },
    );
  }
  if (parsed.data.capability === "platform_adaptation" && !parsed.data.targetPlatform) {
    return NextResponse.json(
      { error: "platform_adaptation requires a targetPlatform." },
      { status: 400, headers: mutatingApiHeaders() },
    );
  }

  const [item] = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, parsed.data.contentItemId))
    .limit(1);
  if (!item)
    return NextResponse.json(
      { error: "Content not found" },
      { status: 404, headers: mutatingApiHeaders() },
    );

  // Get workspace slug for the platform hint
  const [ws] = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(and(eq(workspaces.id, item.workspaceId), eq(workspaces.agencyId, agencyId)))
    .limit(1);
  if (!ws)
    return NextResponse.json(
      { error: "Workspace not found" },
      { status: 404, headers: mutatingApiHeaders() },
    );

  // FEAT-09 — load the AI context (brand voice, active campaign,
  // pillars, channels, approved-content samples) per the
  // planner's selection. The loader respects each boolean so a
  // planner who ticks only "Brand Kit" pays for only that query.
  // The returned object always has the same shape (empty arrays
  // / nulls for the unselected branches) so the builder can
  // render the same template regardless of selection.
  const context = await loadAiContext({
    workspaceId: ws.id,
    contentItemId: item.id,
    selection: parsed.data.contextSelection,
  });

  if (
    !(await hasWorkspaceRole({ id: session.user.id }, ws.id, [
      "workspace_manager",
      "content_planner",
    ]))
  ) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: mutatingApiHeaders() },
    );
  }

  // FEAT-16 (GAP-FULL-REVIEW-2026-08-25) — explicit read-only gate
  // for the AI generation route. The role check above is
  // intentionally narrow (manager/planner only) and already excludes
  // `client_reviewer` + `viewer`; the additional guard is the
  // documentable single source of truth that future refactors can
  // re-use. Defence-in-depth: a refactor that broadens the role
  // list above without also loosening this guard would still block
  // read-only users.
  try {
    await requireWriteCapability({ id: session.user.id }, ws.id, "ai_generate");
  } catch {
    return NextResponse.json(
      { error: "Read-only users cannot trigger AI generation" },
      { status: 403, headers: mutatingApiHeaders() },
    );
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
        { status: 503, headers: mutatingApiHeaders() },
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
      context,
      onUsage: (usage: ChatResult) => {
        providerUsage = usage;
      },
    };
    let text: string | null = null;
    // `brief_improvement` returns THREE variants delimited by
    // `VARIANT_SEPARATOR` in the builder; the route splits the
    // response and exposes the list alongside the first
    // variant in the `text` field for backward compat. The
    // planner surface renders all three side-by-side.
    let variants: string[] | null = null;
    switch (parsed.data.capability) {
      case "caption_drafts":
        text = await draftCaption(baseInput);
        break;
      case "brief_improvement":
        text = await improveBrief(baseInput);
        if (text) variants = splitVariants(text);
        break;
      case "completeness_check":
        text = await checkCompleteness(baseInput);
        break;
      case "platform_adaptation":
        text = await platformAdapt({
          ...baseInput,
          targetPlatform: parsed.data.targetPlatform ?? "instagram",
          sourceText: parsed.data.sourceText ?? item.brief ?? "",
        });
        break;
      case "campaign_ideas":
        text = await campaignIdeas(baseInput);
        break;
      case "related_format_ideas":
        text = await relatedFormatIdeas(baseInput);
        break;
      default:
        return NextResponse.json(
          { error: "Unknown capability" },
          { status: 400, headers: mutatingApiHeaders() },
        );
    }
    if (!text) {
      return NextResponse.json(
        { error: "AI returned no result" },
        { status: 502, headers: mutatingApiHeaders() },
      );
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
    // Build the actual context manifest from the user's selection.
    // FEAT-09 — we now log which categories actually had data, not
    // just which the planner ticked. A workspace with zero Brand
    // Kit rows will report `brand_kit: { selected: true, used:
    // false }` so the audit doesn't claim context was included
    // when it wasn't. Categories the planner didn't tick are
    // simply omitted from the manifest.
    const usedCategories: string[] = ["title", "brief", "format", "workspace_name"];
    const sel = parsed.data.contextSelection;
    if (sel.brandKit) {
      usedCategories.push(
        isContextMeaningful(context) &&
          context.brandVoice.tone.length +
            context.brandVoice.do.length +
            context.brandVoice.dont.length >
            0
          ? "brand_kit:used"
          : "brand_kit:empty",
      );
    }
    if (sel.campaign) {
      usedCategories.push(context.campaign ? "campaign:used" : "campaign:empty");
    }
    if (sel.pillars) {
      usedCategories.push(context.pillars.length > 0 ? "pillars:used" : "pillars:empty");
    }
    if (sel.channels) {
      usedCategories.push(context.channels.length > 0 ? "channels:used" : "channels:empty");
    }
    if (sel.approvedContent) {
      usedCategories.push(
        context.approvedContentSamples.length > 0
          ? "approved_content:used"
          : "approved_content:empty",
      );
    }

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
      contextManifest: { categories: usedCategories },
    });
    return NextResponse.json(
      {
        text,
        capability: parsed.data.capability,
        ...(variants ? { variants } : {}),
      },
      { headers: mutatingApiHeaders() },
    );
  } catch (e) {
    if (e instanceof LimitExceededError) {
      return NextResponse.json(
        { error: e.message, quota: e.details },
        { status: 429, headers: mutatingApiHeaders() },
      );
    }
    if (reservedTokens) {
      await Promise.allSettled([
        recordUsage(db, agencyId, "ai_input_tokens_month", -reservedTokens.input),
        recordUsage(db, agencyId, "ai_output_tokens_month", -reservedTokens.output),
      ]);
    }
    // On failure the context selection may be undefined (parse error);
    // fall back to the basic-only manifest so the audit row reflects
    // what was actually used (or attempted) rather than always the
    // same 4 fields.
    const sel = "contextSelection" in parsed.data ? parsed.data.contextSelection : null;
    const failedCategories: string[] = ["title", "brief", "format", "workspace_name"];
    if (sel) {
      if (sel.brandKit) failedCategories.push("brand_kit");
      if (sel.campaign) failedCategories.push("campaign");
      if (sel.pillars) failedCategories.push("content_pillars");
      if (sel.channels) failedCategories.push("active_channels");
      if (sel.approvedContent) failedCategories.push("approved_content");
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
        contextManifest: { categories: failedCategories },
      })
      .catch(() => undefined);
    captureError("ai.provider_failed", e, {
      requestId,
      userId: session.user.id,
      workspaceId: ws.id,
    });
    return NextResponse.json(
      { error: publicProviderError("ai", e).message },
      { status: 502, headers: mutatingApiHeaders() },
    );
  }
}
