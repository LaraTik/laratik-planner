import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/validation/env";

/**
 * POST /api/dev/sign-out
 *
 * Dev/test-only helper. Clears the NextAuth JWT cookie.
 * Mirrors the production sign-out so tests can reset state.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  if (serverEnv.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: "authjs.session-token",
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 0,
  });
  return res;
}

export async function GET() {
  if (serverEnv.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }
  return POST();
}
