import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { createStorageObjectReadUrl } from "@/lib/storage/read-service";
import { downloadFilename } from "@/lib/media/contract";
import {
  mediaAssetForActor,
  MediaPermissionError,
  renameMediaAsset,
  restoreMediaAsset,
  setMediaAssetVisibility,
  trashMediaAsset,
} from "@/lib/media/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PatchBody = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  visibility: z.enum(["workspace", "agency"]).optional(),
});

/** Issues a short-lived preview/download URL only after media authorization. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const row = await mediaAssetForActor({ id: session.user.id }, id);
  if (!row || row.asset.status !== "ready") {
    return NextResponse.json({ error: "Media asset not found" }, { status: 404 });
  }
  const url = await createStorageObjectReadUrl({
    agencyId: row.asset.agencyId,
    workspaceId: row.asset.ownerWorkspaceId,
    objectId: row.object.id,
    expiresInSeconds: 300,
  });
  if (!url) return NextResponse.json({ error: "Media asset not found" }, { status: 404 });
  if (_req.nextUrl.searchParams.get("download") === "1") {
    const remote = await fetch(url);
    if (!remote.ok || !remote.body)
      return NextResponse.json({ error: "Media asset not found" }, { status: 404 });
    const filename = downloadFilename(
      row.asset.title,
      row.object.originalName,
      row.object.mimeType,
    );
    return new NextResponse(remote.body, {
      status: 200,
      headers: {
        "Content-Type": row.object.mimeType,
        "Content-Length": String(row.object.byteSize),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return NextResponse.redirect(url, {
    status: 307,
    headers: { "Cache-Control": "private, max-age=300" },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (!parsed.data.title && !parsed.data.visibility)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { id } = await params;
  try {
    if (parsed.data.title) await renameMediaAsset(actor, id, parsed.data.title);
    if (parsed.data.visibility) await setMediaAssetVisibility(actor, id, parsed.data.visibility);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof MediaPermissionError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  try {
    await trashMediaAsset(actor, id);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof MediaPermissionError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || body.action !== "restore")
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { id } = await params;
  try {
    await restoreMediaAsset(actor, id);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof MediaPermissionError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }
}
