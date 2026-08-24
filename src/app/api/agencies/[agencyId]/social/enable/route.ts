import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { enableSocial, SocialServiceError } from "@/lib/social/service";

/**
 * POST /api/agencies/[agencyId]/social/enable
 *
 * Enable social analytics for an agency. Agency admin only.
 * Generates a fresh DEK, wraps it with the platform KEK, and
 * returns the plaintext DEK (base64) ONCE. The agency admin
 * MUST save the recovery key now — it will never be shown again.
 *
 * 200 OK — body:
 *   {
 *     dekRecoveryKey: string,   // base64; shown ONCE
 *     dekKeyVersion: number
 *   }
 *
 * 400 — invalid body (none expected today; reserved for future)
 * 401 — not signed in
 * 403 — signed in, not agency admin
 * 409 — already enabled
 * 503 — platform KEK missing (operator has not set
 *       SOCIAL_TOKEN_ENCRYPTION_KEY)
 * 500 — unexpected
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
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
    const result = await enableSocial(actor, agencyId);
    return NextResponse.json(result);
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
