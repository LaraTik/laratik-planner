import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { activeAgencyId } from "@/lib/auth/policy";

/**
 * GET /api/bootstrap/status
 *
 * Returns whether the singleton agency is configured. Used by the sign-in
 * page to decide whether to redirect to /setup after first sign-in.
 *
 * Response:
 *  - { configured: false } when no agency exists yet
 *  - { configured: true, agencyId } when an agency is configured
 */
export async function GET() {
  const session = await auth();
  const agencyId = await activeAgencyId();
  return NextResponse.json({
    configured: !!agencyId,
    agencyId: agencyId ?? null,
    signedIn: !!session?.user?.id,
  });
}
