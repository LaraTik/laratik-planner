import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { rotateSocialDek, SocialServiceError } from "@/lib/social/service";
import { mutatingApiHeaders } from "@/lib/security/headers";

/**
 * POST /api/agencies/[agencyId]/social/dek/rotate
 *
 * Rotate the agency DEK. Re-seals every social_connection in
 * the agency inside a single FOR UPDATE row lock. Agency admin
 * only.
 *
 * Body: `{ "confirm": true }`
 *
 * 200 OK — body:
 *   {
 *     dekRecoveryKey: string,   // base64; shown ONCE
 *     dekKeyVersion: number
 *   }
 *
 * 400 — body missing `confirm: true`
 * 401 — not signed in
 * 403 — signed in, not agency admin
 * 404 — agency has not enabled social
 * 500 — DEK unwrap failed (KEK may have been rotated without
 *       running the re-wrap script)
 * 503 — platform KEK missing
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
    const result = await rotateSocialDek(actor, agencyId, body);
    return NextResponse.json(result, { headers: mutatingApiHeaders() });
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
