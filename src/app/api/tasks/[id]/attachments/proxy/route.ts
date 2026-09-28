import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { PermissionDeniedError } from "@/lib/auth/policy";
import { uploadTaskAttachment } from "@/lib/tasks/attachments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const attachmentId = request.nextUrl.searchParams.get("attachmentId");
  if (!attachmentId || !request.body) {
    return NextResponse.json({ error: "Invalid upload request" }, { status: 400 });
  }
  try {
    await uploadTaskAttachment(
      actor,
      (await params).id,
      attachmentId,
      Readable.fromWeb(
        request.body as unknown as import("node:stream/web").ReadableStream<Uint8Array>,
      ),
    );
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    if (error instanceof PermissionDeniedError)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (error instanceof Error && error.message.startsWith("task."))
      return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
