import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import {
  ensureBrandMediaFolderPath,
  MediaPermissionError,
  registerUploadedMediaAsset,
} from "@/lib/media/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  agencyId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  storageObjectId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
});

/**
 * Brand-kit upload completion path.
 *
 * Routes the freshly-uploaded `storage_object` through
 * `registerUploadedMediaAsset` with `folderId` set to the workspace's
 * `Brand Kit` top-level folder (resolved via
 * `ensureBrandMediaFolderPath`). The asset gets a
 * `media_asset_link` of `target_type='brand_asset'` is created by the
 * brand-kit UI on its own page; this route is concerned only with
 * folder placement.
 *
 * Plan §5.2.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  try {
    const folderId = await ensureBrandMediaFolderPath({
      agencyId: parsed.data.agencyId,
      workspaceId: parsed.data.workspaceId,
      createdBy: actor.id,
    });
    const asset = await registerUploadedMediaAsset({
      actor,
      agencyId: parsed.data.agencyId,
      workspaceId: parsed.data.workspaceId,
      storageObjectId: parsed.data.storageObjectId,
      title: parsed.data.title,
      folderId,
    });
    return NextResponse.json({ asset }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof MediaPermissionError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }
}
