import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { createMediaShareCollection } from "@/lib/media/collection-service";
import { MediaPermissionError } from "@/lib/media/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  sourceType: z.enum(["delivery_version", "library_selection"]),
  sourceId: z.string().uuid().optional(),
  assetIds: z.array(z.string().uuid()).max(100).optional(),
  title: z.string().trim().min(1).max(160),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid collection request" }, { status: 400 });
  try {
    const created = await createMediaShareCollection({
      actor: { id: session.user.id },
      title: parsed.data.title,
      sourceType: parsed.data.sourceType,
      ...(parsed.data.sourceId ? { sourceId: parsed.data.sourceId } : {}),
      ...(parsed.data.assetIds ? { assetIds: parsed.data.assetIds } : {}),
    });
    const origin = new URL(req.url).origin;
    return NextResponse.json(
      {
        ...created,
        url: `${origin}/share/media-collection/${encodeURIComponent(created.token)}`,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
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
