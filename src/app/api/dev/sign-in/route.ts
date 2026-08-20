import { NextResponse, type NextRequest } from "next/server";
import {
  DEV_SESSION_COOKIE_NAME,
  DEV_SESSION_MAX_AGE_SECONDS,
  signInDevUser,
} from "@/lib/auth/dev-sign-in";
import { serverEnv } from "@/lib/validation/env";

/**
 * POST /api/dev/sign-in
 *
 * Dev/test-only helper. Creates (or fetches) a user with the given email,
 * promotes them to "agency_admin" by default, and signs a NextAuth JWT
 * cookie so subsequent requests are authenticated.
 *
 * Gated by NODE_ENV !== "production" (enforced inside the helper).
 * Production builds return 404 because the helper short-circuits.
 *
 * Body: { email: string, name?: string, role?: "agency_admin" | "user" }
 *
 * This is the equivalent of "magic-link sign-in" for E2E tests — it
 * bypasses the Google OAuth and SMTP paths. Real users always use the
 * real providers.
 *
 * Companion UI for humans: `src/app/dev/signin/page.tsx` (one-click form).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    name?: string;
    role?: string;
  };

  const result = await signInDevUser({
    email: body.email ?? "",
    ...(body.name ? { name: body.name } : {}),
    ...(body.role === "user" ? { role: "user" as const } : {}),
  });

  if (!result.ok) {
    const status =
      result.error === "invalid_email" ? 400 : result.error === "missing_auth_secret" ? 500 : 404;
    return NextResponse.json({ error: result.error }, { status });
  }

  const res = NextResponse.json({
    ok: true,
    userId: result.userId,
    email: result.email,
    role: result.role,
  });
  res.cookies.set({
    name: DEV_SESSION_COOKIE_NAME,
    value: result.token,
    httpOnly: true,
    sameSite: "lax",
    secure: serverEnv.NODE_ENV === "production",
    path: "/",
    maxAge: DEV_SESSION_MAX_AGE_SECONDS,
  });
  return res;
}

export async function GET() {
  if (serverEnv.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    info: "POST { email, name?, role? } to this endpoint to receive a NextAuth JWT cookie",
  });
}
