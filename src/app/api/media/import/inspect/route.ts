import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { inspectExternalMediaUrl } from "@/lib/media/contract";
import { fetchPublicMedia, MediaSourceError } from "@/lib/media/source";
import { enforceRateLimit } from "@/lib/security/rate-limit";

const Body = z.object({ url: z.string().trim().min(1).max(2000) });

export const dynamic = "force-dynamic";

/**
 * Performs a bounded secure fetch check without persisting the body.
 * Downloading is still a separate server-side job so quotas, scanning, and
 * retries cannot be bypassed by browser code.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const rate = await enforceRateLimit({
    scope: "media_import_inspect",
    subject: actor.id,
    actorId: actor.id,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many link checks; try again later." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  const result = inspectExternalMediaUrl(parsed.data.url);
  if (!result.ok)
    return NextResponse.json({ error: result.code, code: result.code }, { status: 400 });
  try {
    const source = await fetchPublicMedia({ url: result.url });
    await source.response.body?.cancel();
    return NextResponse.json({
      provider: source.provider,
      kind: source.kind,
      contentType: source.contentType,
      byteSize: source.byteSize,
      extension: source.extension,
      requiresConnection: false,
      nextStep: "The link passed secure checks and is ready to import into private storage.",
    });
  } catch (error) {
    if (error instanceof MediaSourceError) {
      const status = error.code === "provider_connection_required" ? 409 : 422;
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          ...(error.code === "provider_connection_required"
            ? { provider: result.provider, requiresConnection: true }
            : {}),
        },
        { status },
      );
    }
    throw error;
  }
}
