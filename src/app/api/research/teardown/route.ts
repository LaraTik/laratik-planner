import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { aiFeatureSettings, aiUsageEvents } from "@/lib/db/schema";
import {
  enforceAiBudget,
  generateResearchTeardown,
  getActiveApiKey,
  reconcileAiBudget,
  type ChatResult,
} from "@/lib/ai";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { publicProviderError } from "@/lib/security/public-error";
import { getEffectiveEntitlement, LimitExceededError } from "@/lib/entitlements";
import { recordUsage } from "@/lib/usage";
import { captureError } from "@/lib/observability/sentry";
import { randomUUID } from "node:crypto";
import { serverEnv } from "@/lib/validation/env";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { parseResearchTeardown } from "@/lib/research/teardown";

const Body = z.object({
  workspaceSlug: z.string().trim().min(1).max(120),
  title: z.string().trim().max(200).optional(),
  notes: z.string().trim().min(1).max(20_000),
});

/**
 * Preview-only research teardown from planner-entered notes.
 *
 * The first slice deliberately uses the existing `brief_improvement` AI
 * entitlement and budget gate. A dedicated entitlement can be added when
 * provider-media teardown proves valuable enough to justify another toggle.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: mutatingApiHeaders() },
    );
  const actor = await currentActor();
  if (!actor)
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: mutatingApiHeaders() },
    );
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "invalid_body" },
      { status: 400, headers: mutatingApiHeaders() },
    );

  const agency = await resolveActiveAgencyContext({ actor });
  if (!agency)
    return NextResponse.json(
      { error: "no_active_agency" },
      { status: 403, headers: mutatingApiHeaders() },
    );
  const workspace = await getAccessibleWorkspace(actor, parsed.data.workspaceSlug, agency.agencyId);
  if (!workspace)
    return NextResponse.json(
      { error: "workspace_not_accessible" },
      { status: 403, headers: mutatingApiHeaders() },
    );
  if (!(await hasWorkspaceRole(actor, workspace.id, ["workspace_manager", "content_planner"])))
    return NextResponse.json(
      { error: "forbidden" },
      { status: 403, headers: mutatingApiHeaders() },
    );

  const [feature] = await db
    .select({
      enabled: aiFeatureSettings.enabled,
      enabledCapabilities: aiFeatureSettings.enabledCapabilities,
    })
    .from(aiFeatureSettings)
    .where(eq(aiFeatureSettings.agencyId, agency.agencyId))
    .limit(1);
  if (!feature?.enabled || !feature.enabledCapabilities.includes("brief_improvement"))
    return NextResponse.json(
      { error: "research_teardown_disabled" },
      { status: 403, headers: mutatingApiHeaders() },
    );

  const entitlement = await getEffectiveEntitlement({ agencyId: agency.agencyId });
  if (!entitlement.enabledAiCapabilities.has("brief_improvement"))
    return NextResponse.json(
      { error: "research_teardown_not_in_plan" },
      { status: 403, headers: mutatingApiHeaders() },
    );

  const requestId = req.headers.get("x-request-id") ?? randomUUID();
  const limit = await enforceRateLimit({
    scope: "ai_generation",
    subject: session.user.id,
    actorId: session.user.id,
    requestId,
  });
  if (!limit.allowed)
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { ...mutatingApiHeaders(), "Retry-After": String(limit.retryAfterSeconds) },
      },
    );

  const apiKey = await getActiveApiKey(agency.agencyId);
  if (!apiKey)
    return NextResponse.json(
      { error: "provider_not_configured" },
      { status: 503, headers: mutatingApiHeaders() },
    );

  const estimatedInput = Math.max(1, Math.ceil(parsed.data.notes.length / 4));
  const outputReservation = Math.max(
    1,
    Math.min(900, entitlement.maxOutputTokensPerRequest ?? 900),
  );
  let reservedTokens: { input: number; output: number } | null = null;
  try {
    await db.transaction(async (tx) => {
      await enforceAiBudget({
        tx,
        agencyId: agency.agencyId,
        userId: session.user.id,
        capability: "brief_improvement",
        estimatedInputTokens: estimatedInput,
        estimatedOutputTokens: outputReservation,
        requestId,
      });
    });
    reservedTokens = { input: estimatedInput, output: outputReservation };

    let providerUsage: ChatResult | null = null;
    const raw = await generateResearchTeardown({
      source: { kind: "planner_notes", notes: parsed.data.notes },
      ...(parsed.data.title ? { title: parsed.data.title } : {}),
      apiKey,
      maxTokens: outputReservation,
      onUsage: (usage) => {
        providerUsage = usage;
      },
    });
    if (!raw) throw new Error("AI returned no teardown");
    const teardown = parseResearchTeardown(raw);
    if (!teardown.ok) throw new Error(`AI returned invalid teardown: ${teardown.error}`);

    const actualInput = (providerUsage as ChatResult | null)?.inputTokens ?? estimatedInput;
    const actualOutput = (providerUsage as ChatResult | null)?.outputTokens ?? outputReservation;
    await reconcileAiBudget({
      agencyId: agency.agencyId,
      userId: session.user.id,
      estimatedInputTokens: estimatedInput,
      estimatedOutputTokens: outputReservation,
      actualInputTokens: actualInput,
      actualOutputTokens: actualOutput,
    });
    reservedTokens = { input: actualInput, output: actualOutput };
    await db.insert(aiUsageEvents).values({
      agencyId: agency.agencyId,
      workspaceId: workspace.id,
      userId: session.user.id,
      capability: "brief_improvement",
      model: serverEnv.MINIMAX_MODEL,
      inputTokens: actualInput,
      outputTokens: actualOutput,
      requestId,
      succeeded: true,
      contextManifest: { categories: ["research_notes", "preview_only"] },
    });
    return NextResponse.json(
      { teardown: teardown.data, previewOnly: true },
      { headers: mutatingApiHeaders() },
    );
  } catch (error) {
    if (error instanceof LimitExceededError)
      return NextResponse.json(
        { error: "quota_exceeded" },
        { status: 429, headers: mutatingApiHeaders() },
      );
    if (reservedTokens) {
      await Promise.allSettled([
        recordUsage(db, agency.agencyId, "ai_input_tokens_month", -reservedTokens.input),
        recordUsage(db, agency.agencyId, "ai_output_tokens_month", -reservedTokens.output),
      ]);
    }
    await db
      .insert(aiUsageEvents)
      .values({
        agencyId: agency.agencyId,
        workspaceId: workspace.id,
        userId: session.user.id,
        capability: "brief_improvement",
        model: serverEnv.MINIMAX_MODEL,
        inputTokens: 0,
        outputTokens: 0,
        requestId,
        succeeded: false,
        contextManifest: { categories: ["research_notes", "preview_only"] },
      })
      .catch(() => undefined);
    captureError("research.teardown_failed", error, {
      requestId,
      userId: session.user.id,
      workspaceId: workspace.id,
    });
    return NextResponse.json(
      { error: publicProviderError("ai", error).message },
      { status: 502, headers: mutatingApiHeaders() },
    );
  }
}
