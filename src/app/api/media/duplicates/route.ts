import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentActor } from "@/lib/auth/current-actor";
import { MEDIA_KINDS } from "@/lib/media/contract";
import { findDuplicateMediaAssets, MediaPermissionError } from "@/lib/media/service";
import { enforceRateLimit } from "@/lib/security/rate-limit";

const Body = z.object({
  workspaceId: z.string().uuid(),
  checksumSha256: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9+/_=-]{40,64}$/),
  kind: z.enum(MEDIA_KINDS),
});

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Finds visible matching assets without exposing source URLs or storage keys. */
export async function POST(req: NextRequest) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const rate = await enforceRateLimit({
    scope: "media_duplicate_lookup",
    subject: actor.id,
    actorId: actor.id,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many duplicate checks; try again later." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  try {
    const duplicates = await findDuplicateMediaAssets(actor, parsed.data);
    return NextResponse.json({ duplicates }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof MediaPermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}
