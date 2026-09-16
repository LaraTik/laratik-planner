import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { linkedTargetsForMediaAsset, MediaPermissionError } from "@/lib/media/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Returns every `media_asset_link` row for a single asset, with a
 * label and a deep href to the consuming idea/delivery/comment/brand
 * asset. Honours `clientVisible` privacy (decision G).
 *
 * Used by the library's "In use by" panel (plan §3.3).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const agencyId = z.string().uuid().safeParse(_req.nextUrl.searchParams.get("agencyId"));
  if (!agencyId.success) {
    return NextResponse.json({ error: "agencyId is required" }, { status: 400 });
  }
  try {
    const links = await linkedTargetsForMediaAsset(actor, {
      agencyId: agencyId.data,
      assetId: id,
    });
    return NextResponse.json({ links }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof MediaPermissionError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }
}
