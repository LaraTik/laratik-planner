import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { bootstrapFirstAdmin } from "@/lib/auth/bootstrap";
import { firstAgencyForBootstrap, isAgencyAdmin } from "@/lib/auth/policy";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { db } from "@/lib/db";
import { securityAuditEvents } from "@/lib/db/schema";

const Body = z.object({
  agencyName: z.string().min(2).max(100),
  agencySlug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/, "Use lowercase letters, digits, and hyphens"),
  token: z.string().min(1),
});

/**
 * POST /api/bootstrap/admin
 *
 * Body: { agencyName, agencySlug, token }
 * Auth: must be signed in (any provider)
 *
 * Creates the singleton agency and marks the signed-in user as the first
 * admin. Idempotent: if an admin already exists, returns already_configured.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Not signed in" },
      { status: 401, headers: mutatingApiHeaders() },
    );
  }

  const contentType = req.headers.get("content-type") ?? "";
  const rawBody = contentType.includes("application/json")
    ? await req.json().catch(() => null)
    : Object.fromEntries(await req.formData().catch(() => new FormData()));
  const parsed = Body.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.flatten().fieldErrors },
      { status: 400, headers: mutatingApiHeaders() },
    );
  }

  const subject = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || session.user.id;
  const requestId = req.headers.get("x-request-id") ?? undefined;
  const limit = await enforceRateLimit({
    scope: "bootstrap",
    subject,
    actorId: session.user.id,
    ...(requestId ? { requestId } : {}),
  });
  if (!limit.allowed) {
    await db.insert(securityAuditEvents).values({
      actorId: session.user.id,
      action: "bootstrap",
      targetType: "agency",
      outcome: "denied",
      ...(requestId ? { requestId } : {}),
      metadata: { reason: "rate_limit_exceeded", windowSeconds: limit.retryAfterSeconds },
    });
    return NextResponse.json(
      { error: "Too many setup attempts. Please try again later." },
      {
        status: 429,
        headers: { ...mutatingApiHeaders(), "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  // If an agency admin already exists, refuse
  const agencyId = await firstAgencyForBootstrap();
  if (agencyId && (await isAgencyAdmin({ id: session.user.id }, agencyId))) {
    return NextResponse.json(
      { error: "Already configured", agencyId },
      { status: 409, headers: mutatingApiHeaders() },
    );
  }

  const result = await bootstrapFirstAdmin({
    userId: session.user.id,
    agencyName: parsed.data.agencyName,
    agencySlug: parsed.data.agencySlug,
    token: parsed.data.token,
  });

  if (result.status === "invalid_token") {
    await db.insert(securityAuditEvents).values({
      actorId: session.user.id,
      action: "bootstrap",
      targetType: "agency",
      outcome: "denied",
      ...(requestId ? { requestId } : {}),
      metadata: { reason: "invalid_token" },
    });
    return NextResponse.json(
      { error: "Invalid token" },
      { status: 403, headers: mutatingApiHeaders() },
    );
  }
  if (result.status === "already_configured") {
    return NextResponse.json(
      { error: "Already configured", agencyId: result.agencyId },
      { status: 409, headers: mutatingApiHeaders() },
    );
  }

  await db.insert(securityAuditEvents).values({
    actorId: session.user.id,
    action: "bootstrap",
    targetType: "agency",
    targetId: result.agencyId,
    outcome: "success",
    ...(requestId ? { requestId } : {}),
    metadata: { agencySlug: parsed.data.agencySlug },
  });

  return NextResponse.json(
    {
      status: "ok",
      agencyId: result.agencyId,
      userId: result.userId,
    },
    { headers: mutatingApiHeaders() },
  );
}
