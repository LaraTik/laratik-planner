import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { currentActor } from "@/lib/auth/current-actor";
import { db } from "@/lib/db";
import { aiFeatureSettings, aiUsageEvents, contentItems, workspaces } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { checkCompleteness, draftCaption, improveBrief, isAiEnabled } from "@/lib/ai";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { publicProviderError } from "@/lib/security/public-error";
import { randomUUID } from "node:crypto";
import { serverEnv } from "@/lib/validation/env";
import { logError } from "@/lib/observability/logger";

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
  if (!isAiEnabled()) {
    return NextResponse.json(
      { error: "AI features are disabled. Set AI_FEATURE_ENABLED=true and MINIMAX_API_KEY." },
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
  if (allowed.size > 0 && !allowed.has(parsed.data.capability)) {
    return NextResponse.json(
      {
        error: `Capability "${parsed.data.capability}" is disabled in agency settings.`,
      },
      { status: 403 },
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
    .where(eq(workspaces.id, item.workspaceId))
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

  try {
    const usageRequestId = requestId ?? randomUUID();
    const baseInput = {
      title: item.title,
      brief: item.brief,
      format: item.format,
      audience: ws.name,
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
      case "platform_adaptation":
      case "campaign_ideas":
      case "related_format_ideas":
        return NextResponse.json(
          { error: `Capability "${parsed.data.capability}" is not yet implemented.` },
          { status: 501 },
        );
      default:
        return NextResponse.json({ error: "Unknown capability" }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ error: "AI returned no result" }, { status: 502 });
    }
    await db.insert(aiUsageEvents).values({
      agencyId,
      workspaceId: ws.id,
      contentItemId: item.id,
      userId: session.user.id,
      capability: parsed.data.capability,
      model: serverEnv.MINIMAX_MODEL,
      requestId: usageRequestId,
      succeeded: true,
      contextManifest: { categories: ["title", "brief", "format", "workspace_name"] },
    });
    return NextResponse.json({ text, capability: parsed.data.capability });
  } catch (e) {
    logError("ai.provider_failed", {
      cause: e,
      requestId,
      userId: session.user.id,
      workspaceId: ws.id,
    });
    return NextResponse.json({ error: publicProviderError("ai", e).message }, { status: 502 });
  }
}

// silence unused import warning for the `and` helper that may be used
// by future capability additions (kept here so the import surface is
// stable for unit tests that mock the schema queries).
void and;
