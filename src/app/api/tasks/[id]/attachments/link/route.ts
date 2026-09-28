import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { PermissionDeniedError } from "@/lib/auth/policy";
import { createTaskAttachmentLink } from "@/lib/tasks/attachments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  url: z.string().trim().url(),
  originalName: z.string().trim().max(255).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  try {
    return NextResponse.json({
      attachment: await createTaskAttachmentLink(actor, (await params).id, parsed.data),
    });
  } catch (error) {
    if (error instanceof PermissionDeniedError)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (error instanceof Error && error.message.startsWith("task."))
      return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
