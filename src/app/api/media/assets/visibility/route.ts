import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { bulkSetMediaAssetVisibility, MediaPermissionError } from "@/lib/media/service";
import { BULK_SELECTION_TOO_LARGE, MAX_BULK_SELECTION } from "@/lib/media/bulk-cap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  assetIds: z.array(z.string().uuid()).min(1),
  visibility: z.enum(["workspace", "agency"]),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  if (parsed.data.assetIds.length > MAX_BULK_SELECTION) {
    return NextResponse.json(
      { error: BULK_SELECTION_TOO_LARGE, max: MAX_BULK_SELECTION },
      { status: 400 },
    );
  }
  try {
    const result = await bulkSetMediaAssetVisibility(actor, parsed.data);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof MediaPermissionError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }
}
