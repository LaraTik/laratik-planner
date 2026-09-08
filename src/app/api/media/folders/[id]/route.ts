import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { archiveMediaFolder, MediaPermissionError, renameMediaFolder } from "@/lib/media/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({ name: z.string().trim().min(1).max(80) });

function handleError(error: unknown) {
  if (error instanceof MediaPermissionError)
    return NextResponse.json({ error: error.message }, { status: 403 });
  throw error;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { id } = await params;
  try {
    const folder = await renameMediaFolder({ id: session.user.id }, id, parsed.data.name);
    return NextResponse.json({ folder }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  try {
    const folder = await archiveMediaFolder({ id: session.user.id }, id);
    return NextResponse.json({ folder }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleError(error);
  }
}
