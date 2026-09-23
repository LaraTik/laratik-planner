import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { createTaskAttachmentIntent } from "@/lib/tasks/attachments";
import { PermissionDeniedError } from "@/lib/auth/policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  originalName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(160),
  byteSize: z
    .number()
    .int()
    .min(1)
    .max(50 * 1024 * 1024),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  try {
    return NextResponse.json(
      await createTaskAttachmentIntent(actor, (await params).id, parsed.data),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof PermissionDeniedError)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (error instanceof Error && error.message.startsWith("task."))
      return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
