import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { getMediaFolderAudit, MediaPermissionError } from "@/features/media/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Query = z.object({
  agencyId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

/**
 * Returns recent folder reconcile events for a workspace. Powers the
 * tree-row "info" panel (plan §3.9 rule 2).
 *
 * Returns one row per reconcile, joined to the actor's display name
 * so the UI doesn't have to fetch the user list.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = Query.safeParse({
    agencyId: req.nextUrl.searchParams.get("agencyId"),
    workspaceId: req.nextUrl.searchParams.get("workspaceId"),
    limit: req.nextUrl.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  try {
    const events = await getMediaFolderAudit(actor, parsed.data);
    return NextResponse.json({ events }, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (error) {
    if (error instanceof MediaPermissionError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw error;
  }
}
