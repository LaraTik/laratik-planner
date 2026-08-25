import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { resetSocialRecovery, SocialServiceError } from "@/lib/social/service";
import { mutatingApiHeaders } from "@/lib/security/headers";

/**
 * POST /api/agencies/[agencyId]/social/dek/reset-recovery
 *
 * Reset the DEK recovery for an agency that has lost their
 * recovery key. Disconnects every social_connection in the
 * agency (preserves audit + metric history), deletes the DEK
 * row, and writes an audit event. The agency must re-enable
 * social afterwards to use it again.
 *
 * Body: `{ "confirm": true }`
 *
 * 204 No Content — success
 * 400 — body missing `confirm: true`
 * 401 — not signed in
 * 403 — signed in, not agency admin
 * 500 — unexpected
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401, headers: mutatingApiHeaders() },
    );
  }
  const actor = await currentActor();
  if (!actor) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401, headers: mutatingApiHeaders() },
    );
  }
  const { agencyId } = await ctx.params;
  if (typeof agencyId !== "string" || agencyId.length === 0) {
    return NextResponse.json(
      { error: "Missing agencyId" },
      { status: 400, headers: mutatingApiHeaders() },
    );
  }
  const body = await req.json().catch(() => ({}));
  try {
    await resetSocialRecovery(actor, agencyId, body);
    return new NextResponse(null, { status: 204, headers: mutatingApiHeaders() });
  } catch (err) {
    if (err instanceof SocialServiceError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status, headers: mutatingApiHeaders() },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500, headers: mutatingApiHeaders() },
    );
  }
}
