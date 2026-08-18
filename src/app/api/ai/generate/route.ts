import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { activeAgencyId, hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { contentItems, workspaces } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { draftCaption, isAiEnabled } from "@/lib/ai";

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

  if (!(await hasWorkspaceRole({ id: session.user.id }, ws.id, [
    "workspace_manager",
    "content_planner",
  ]))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const caption = await draftCaption({
      title: item.title,
      brief: item.brief,
      format: item.format,
      audience: ws.name,
    });
    if (!caption) {
      return NextResponse.json({ error: "AI returned no result" }, { status: 502 });
    }
    return NextResponse.json({ caption });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
