import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { users, notifications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { serverEnv } from "@/lib/validation/env";

/**
 * POST /api/dev/notifications
 *
 * Dev/test-only helper. Inserts N in-app notifications for an existing
 * user (matched by email). Used by Playwright to seed the notifications
 * bell before testing the UI.
 *
 * Body:
 *   {
 *     email: "test@laratik.local",   // required
 *     count: 3,                      // optional, default 1
 *     readCount: 1,                  // optional, default 0 (all unread)
 *   }
 *
 * Returns:
 *   { ok: true, created: 3, userId: "..." }
 *
 * Production builds return 404.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  email?: string;
  count?: number;
  readCount?: number;
};

export async function POST(req: NextRequest) {
  if (serverEnv.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Not available in production" },
      { status: 404, headers: mutatingApiHeaders() },
    );
  }
  const body = (await req.json().catch(() => ({}))) as Body;
  if (!body.email) {
    return NextResponse.json(
      { error: "email is required" },
      { status: 400, headers: mutatingApiHeaders() },
    );
  }
  const count = Math.min(Math.max(body.count ?? 1, 0), 50);
  const readCount = Math.min(Math.max(body.readCount ?? 0, 0), count);

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, body.email))
    .limit(1);
  if (!user) {
    return NextResponse.json(
      { error: `User not found: ${body.email}` },
      { status: 404, headers: mutatingApiHeaders() },
    );
  }

  const now = Date.now();
  const rows = Array.from({ length: count }, (_, i) => ({
    userId: user.id,
    kind: "system" as const,
    title: `Test notification ${i + 1}`,
    body: `Seeded by E2E at ${new Date(now).toISOString()}`,
    readAt: i < readCount ? new Date(now - (count - i) * 1000) : null,
  }));
  if (rows.length > 0) {
    await db.insert(notifications).values(rows);
  }

  return NextResponse.json(
    { ok: true, created: rows.length, userId: user.id },
    { headers: mutatingApiHeaders() },
  );
}

export async function GET() {
  if (serverEnv.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Not available in production" },
      { status: 404, headers: mutatingApiHeaders() },
    );
  }
  return NextResponse.json({
    ok: true,
    info: "POST { email, count?, readCount? } to seed notifications for a user.",
  });
}
