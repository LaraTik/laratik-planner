import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/config";
import { revokeMediaShareCollection } from "@/lib/media/collection-service";
import { MediaPermissionError } from "@/lib/media/service";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    const result = await revokeMediaShareCollection({ id: session.user.id }, (await params).id);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof MediaPermissionError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }
}
