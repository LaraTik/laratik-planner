import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { activeAgencyId, hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { aiUsageEvents, contentItems, workspaces } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { draftCaption, isAiEnabled } from "@/lib/ai";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { publicProviderError } from "@/lib/security/public-error";
import { randomUUID } from "node:crypto";
import { serverEnv } from "@/lib/validation/env";
import { logError } from "@/lib/observability/logger";

/**
 * POST /api/ai/generate
 *
 * Body: { contentItemId }
 * Auth: signed in + workspace member
 *
 * Returns a generated caption draft. The user is responsible for saving
 * it (we never auto-write to the DB — master prompt §0.13 "AI never
 * bypasses human control").
 */
const Body = z.object({
  contentItemId: z.string().uuid(),
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

  const agencyId = await activeAgencyId();
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
    const caption = await draftCaption({
      title: item.title,
      brief: item.brief,
      format: item.format,
      audience: ws.name,
    });
    if (!caption) {
      return NextResponse.json({ error: "AI returned no result" }, { status: 502 });
    }
    await db.insert(aiUsageEvents).values({
      agencyId,
      workspaceId: ws.id,
      contentItemId: item.id,
      userId: session.user.id,
      capability: "caption_draft",
      model: serverEnv.MINIMAX_MODEL,
      requestId: usageRequestId,
      succeeded: true,
      contextManifest: { categories: ["title", "brief", "format", "workspace_name"] },
    });
    return NextResponse.json({ caption });
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
