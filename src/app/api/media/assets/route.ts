import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { registerUploadedMediaAsset, MediaPermissionError } from "@/lib/media/service";

const Body = z.object({
  workspaceId: z.string().uuid(),
  storageObjectId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  visibility: z.enum(["workspace", "agency"]).default("workspace"),
});

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    const asset = await registerUploadedMediaAsset({
      actor: { id: session.user.id },
      agencyId: workspace.agencyId,
      ...parsed.data,
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
