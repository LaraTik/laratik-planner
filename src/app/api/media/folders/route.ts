import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { createMediaFolder, listMediaFolders, MediaPermissionError } from "@/lib/media/service";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CreateBody = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  const parsed = z.string().uuid().safeParse(workspaceId);
  if (!parsed.success) return NextResponse.json({ error: "Invalid workspace" }, { status: 400 });
  const [workspace] = await db
    .select({ agencyId: workspaces.agencyId })
    .from(workspaces)
    .where(eq(workspaces.id, parsed.data))
    .limit(1);
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  const folders = await listMediaFolders(
    { id: session.user.id },
    { agencyId: workspace.agencyId, workspaceId: parsed.data },
  );
  return NextResponse.json({ folders }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const [workspace] = await db
    .select({ agencyId: workspaces.agencyId })
    .from(workspaces)
    .where(eq(workspaces.id, parsed.data.workspaceId))
    .limit(1);
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  try {
    const folder = await createMediaFolder(
      { id: session.user.id },
      { ...parsed.data, agencyId: workspace.agencyId },
    );
    return NextResponse.json({ folder }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof MediaPermissionError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }
}
