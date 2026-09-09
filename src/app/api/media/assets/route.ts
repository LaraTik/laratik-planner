import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  listMediaAssets,
  registerUploadedMediaAsset,
  MediaPermissionError,
} from "@/lib/media/service";

const Body = z.object({
  workspaceId: z.string().uuid(),
  storageObjectId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  folderId: z.string().uuid().nullable().optional(),
  contentItemId: z.string().uuid().optional(),
  visibility: z.enum(["workspace", "agency"]).default("workspace"),
});

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SearchKind = z.enum(["image", "video", "document"]);

/** Search the authorized workspace catalog without returning the whole library. */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId || !z.string().uuid().safeParse(workspaceId).success) {
    return NextResponse.json({ error: "Invalid workspace" }, { status: 400 });
  }

  const kindParam = req.nextUrl.searchParams.get("kind");
  const kind = kindParam ? SearchKind.safeParse(kindParam) : null;
  if (kindParam && !kind?.success) {
    return NextResponse.json({ error: "Invalid media kind" }, { status: 400 });
  }

  const query = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!query) {
    return NextResponse.json({ assets: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  const [workspace] = await db
    .select({ agencyId: workspaces.agencyId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  const rows = await listMediaAssets(
    { id: session.user.id },
    {
      agencyId: workspace.agencyId,
      workspaceId,
      query,
      ...(kind?.success ? { kind: kind.data } : {}),
      limit: 30,
    },
  );

  return NextResponse.json(
    {
      assets: rows
        .filter((row) => row.asset.status === "ready" && row.object.status === "active")
        .map((row) => ({
          id: row.asset.id,
          title: row.asset.title,
          kind: row.object.kind,
          mimeType: row.object.mimeType,
          byteSize: row.object.byteSize,
          workspaceName: row.workspaceName,
          visibility: row.asset.visibility,
          altText: row.asset.altText,
        })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Registers a verified storage object in the reusable media catalog. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const [workspace] = await db
    .select({ agencyId: workspaces.agencyId })
    .from(workspaces)
    .where(eq(workspaces.id, parsed.data.workspaceId))
    .limit(1);
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  try {
    const { folderId, contentItemId, ...assetInput } = parsed.data;
    const asset = await registerUploadedMediaAsset({
      actor: { id: session.user.id },
      agencyId: workspace.agencyId,
      ...assetInput,
      ...(folderId !== undefined ? { folderId } : {}),
      ...(contentItemId ? { contentItemId } : {}),
    });
    return NextResponse.json({ asset }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof MediaPermissionError) {
      return NextResponse.json(
        { error: error.message, code: "media.permission_denied" },
        { status: 403 },
      );
    }
    throw error;
  }
}
