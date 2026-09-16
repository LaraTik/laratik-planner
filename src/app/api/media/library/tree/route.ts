import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { listMediaFoldersTree, MediaPermissionError } from "@/lib/media/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Query = z.object({
  agencyId: z.string().uuid(),
  workspaceId: z.string().uuid(),
});

/**
 * Returns the folder tree for a workspace, decorated with asset
 * counts (`assetCount`, `descendantAssetCount`) and a `kind`
 * discriminator (`system` vs `user`) so the UI can render badges
 * and surface the audit panel.
 *
 * Plan §3.4 / §3.5.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = Query.safeParse({
    agencyId: req.nextUrl.searchParams.get("agencyId"),
    workspaceId: req.nextUrl.searchParams.get("workspaceId"),
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  try {
    const folders = await listMediaFoldersTree(actor, parsed.data);
    return NextResponse.json(
      { folders },
      {
        headers: {
          // 60 s shared cache + stale-while-revalidate: tree is
          // expensive on big workspaces and changes infrequently.
          "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    if (error instanceof MediaPermissionError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }
}
