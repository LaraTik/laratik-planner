import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/config";
import { clientEnv, serverEnv } from "@/lib/validation/env";
import {
  activeMediaShareForActor,
  createPublicMediaShare,
  MediaPermissionError,
  revokePublicMediaShare,
} from "@/lib/media/service";
import { resolvePublicAppOrigin } from "@/lib/http/public-app-origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof MediaPermissionError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  throw error;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  try {
    const result = await activeMediaShareForActor({ id: session.user.id }, id);
    return NextResponse.json(
      { active: Boolean(result.share), expiresAt: result.share?.expiresAt ?? null },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  try {
    const result = await createPublicMediaShare({ id: session.user.id }, id);
    const origin = resolvePublicAppOrigin({
      requestOrigin: req.nextUrl.origin,
      configuredOrigins: [serverEnv.AUTH_URL, clientEnv.NEXT_PUBLIC_APP_URL],
      allowLocalhost: serverEnv.NODE_ENV !== "production",
    });
    const url = new URL(`/share/media/${encodeURIComponent(result.token)}`, origin);
    return NextResponse.json(
      { url: url.toString(), expiresAt: result.expiresAt },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  try {
    const result = await revokePublicMediaShare({ id: session.user.id }, id);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return errorResponse(error);
  }
}
