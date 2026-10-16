import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { createMediaShareCollection } from "@/lib/media/collection-service";
import { MediaPermissionError } from "@/lib/media/service";
import { resolvePublicAppOrigin } from "@/lib/http/public-app-origin";
import { clientEnv, serverEnv } from "@/lib/validation/env";

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
    // Never copy the request origin into a shareable link. Behind Traefik the
    // container binds `HOSTNAME=0.0.0.0` (Dockerfile), so the host the route
    // observes is the proxy-facing bind address — a link built from it reads
    // `http://0.0.0.0:3000/share/...` and is unusable by the recipient.
    // Same resolver as the single-asset public link route; see
    // `src/lib/http/public-app-origin.ts`.
    const origin = resolvePublicAppOrigin({
      requestOrigin: req.nextUrl.origin,
      configuredOrigins: [serverEnv.AUTH_URL, clientEnv.NEXT_PUBLIC_APP_URL],
      allowLocalhost: serverEnv.NODE_ENV !== "production",
    });
    return NextResponse.json(
      {
        ...created,
        url: new URL(
          `/share/media-collection/${encodeURIComponent(created.token)}`,
          origin,
        ).toString(),
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
