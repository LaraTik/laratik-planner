import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentActor } from "@/lib/auth/current-actor";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { importPublicMediaAsset, MediaPermissionError } from "@/lib/media/service";
import { MediaSourceError } from "@/lib/media/source";
import { enforceRateLimit } from "@/lib/security/rate-limit";

const Body = z.object({
  workspaceId: z.string().uuid(),
  url: z.string().trim().url().max(2048),
  title: z.string().trim().max(160).optional(),
  contentItemId: z.string().uuid().optional(),
  visibility: z.enum(["workspace", "agency"]).optional(),
});

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const rate = await enforceRateLimit({
    scope: "media_import",
    subject: actor.id,
    actorId: actor.id,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many media imports; try again later." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const [workspace] = await db
    .select({ agencyId: workspaces.agencyId })
    .from(workspaces)
    .where(eq(workspaces.id, parsed.data.workspaceId))
    .limit(1);
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  try {
    const asset = await importPublicMediaAsset({
      actor,
      agencyId: workspace.agencyId,
      workspaceId: parsed.data.workspaceId,
      url: parsed.data.url,
      ...(parsed.data.title ? { title: parsed.data.title } : {}),
      ...(parsed.data.contentItemId ? { contentItemId: parsed.data.contentItemId } : {}),
      ...(parsed.data.visibility ? { visibility: parsed.data.visibility } : {}),
    });
    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    if (error instanceof MediaPermissionError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof MediaSourceError) {
      const status = error.code === "provider_connection_required" ? 409 : 422;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    throw error;
  }
}
