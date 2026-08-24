import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { getSocialStatus, SocialServiceError } from "@/lib/social/service";

/**
 * GET /api/agencies/[agencyId]/social
 *
 * Returns the current social-analytics status for an agency.
 * Agency admin only.
 *
 * 200 OK — body:
 *   {
 *     enabled: boolean,
 *     dekKeyVersion?: number,        // when enabled
 *     enabledAt?: string (ISO),      // when enabled
 *     lastRotatedAt?: string | null, // when enabled
 *     rotationReason?: string | null,// when enabled
 *     connectionCount: number,
 *     platformKekAvailable: boolean, // whether the platform
 *                                   // operator has set the KEK
 *   }
 *
 * 401 — not signed in
 * 403 — signed in, not agency admin
 * 500 — unexpected
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const actor = await currentActor();
  if (!actor) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { agencyId } = await ctx.params;
  if (typeof agencyId !== "string" || agencyId.length === 0) {
    return NextResponse.json({ error: "Missing agencyId" }, { status: 400 });
  }
  try {
    const status = await getSocialStatus(actor, agencyId);
    return NextResponse.json({
      ...status,
      enabledAt: status.enabled ? status.enabledAt.toISOString() : undefined,
      lastRotatedAt: status.enabled ? (status.lastRotatedAt?.toISOString() ?? null) : undefined,
    });
  } catch (err) {
    if (err instanceof SocialServiceError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 },
    );
  }
}
