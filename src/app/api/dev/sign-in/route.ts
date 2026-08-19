import { NextResponse, type NextRequest } from "next/server";
import { encode } from "next-auth/jwt";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { serverEnv } from "@/lib/validation/env";

/**
 * POST /api/dev/sign-in
 *
 * Dev/test-only helper. Creates (or fetches) a user with the given email,
 * promotes them to "agency_admin", and signs a NextAuth JWT cookie so
 * subsequent requests are authenticated.
 *
 * Gated by NODE_ENV !== "production". Production builds will return
 * 404 for this route (Next.js does not register the handler in prod).
 *
 * Body: { email: string, name?: string, role?: "agency_admin" | "user" }
 *
 * This is the equivalent of "magic-link sign-in" for E2E tests — it
 * bypasses the Google OAuth and SMTP paths. Real users always use the
 * real providers.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isDevOrTest() {
  return serverEnv.NODE_ENV !== "production";
}

export async function POST(req: NextRequest) {
  if (!isDevOrTest()) {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    name?: string;
    role?: string;
  };

  const email = (body.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const role = body.role === "user" ? "user" : "agency_admin";
  const name = body.name?.trim() || email.split("@")[0]!;

  // Find or create the user. Email-verified at sign-in time.
  const existing = await db
    .select({ id: users.id, role: users.role, name: users.name })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  let userId: string;
  if (existing[0]) {
    userId = existing[0].id;
    // Keep role in sync (idempotent for E2E)
    if (existing[0].role !== role) {
      await db.update(users).set({ role }).where(eq(users.id, userId));
    }
  } else {
    const [created] = await db
      .insert(users)
      .values({
        email,
        name,
        displayName: name,
        role,
        emailVerified: new Date(),
      })
      .returning({ id: users.id });
    userId = created!.id;
  }

  // Sign the NextAuth JWT cookie (v5 uses @auth/core token shape)
  if (!serverEnv.AUTH_SECRET) {
    return NextResponse.json({ error: "AUTH_SECRET not set" }, { status: 500 });
  }
  const token = await encode({
    token: {
      sub: userId,
      id: userId,
      role,
      email,
      name,
    },
    secret: serverEnv.AUTH_SECRET,
    salt: "authjs.session-token",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });

  const res = NextResponse.json({
    ok: true,
    userId,
    email,
    role,
  });
  res.cookies.set({
    name: "authjs.session-token",
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: serverEnv.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}

export async function GET() {
  if (!isDevOrTest()) {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    info: "POST { email, name?, role? } to this endpoint to receive a NextAuth JWT cookie",
  });
}
