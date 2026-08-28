import { createHash } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { rateLimitEvents, securityAuditEvents } from "@/lib/db/schema";
import { serverEnv } from "@/lib/validation/env";

export type RateLimitScope =
  | "bootstrap"
  | "invitation_create"
  | "invitation_accept"
  | "invitation_resend"
  | "user_create"
  | "ai_generation"
  | "magic_link_request"
  | "password_reset_request"
  | "upload_sign"
  | "support_access_request"
  | "support_access_decision";

const RULES: Record<RateLimitScope, { limit: number; windowSeconds: number }> = {
  bootstrap: { limit: 5, windowSeconds: 15 * 60 },
  invitation_create: { limit: 20, windowSeconds: 60 * 60 },
  invitation_accept: { limit: 10, windowSeconds: 15 * 60 },
  invitation_resend: { limit: 10, windowSeconds: 60 * 60 },
  // Direct user creation ("Add directly" tab on /app/users). Same
  // budget as invitation_create — both surface is "an admin adds a
  // new human to the agency" and a sudden burst of either is the
  // threat we're throttling. Subject is the actor's user id; an
  // attacker would need a valid admin session to trip the limit.
  user_create: { limit: 20, windowSeconds: 60 * 60 },
  ai_generation: { limit: 30, windowSeconds: 60 },
  // Magic-link request: throttles per (email, source IP) at 5/hour. The
  // (email, IP) composite prevents both targeted email-spam (limit per
  // email) and IP-rotation spam (limit per IP). Defense against the
  // "request a sign-in link for arbitrary laratik.com addresses" vector.
  magic_link_request: { limit: 5, windowSeconds: 60 * 60 },
  // Password-reset request: dedicated scope for /signin/forgot-password.
  // Distinct from magic_link_request in the audit log so abuse on the
  // reset surface is visible independently of sign-in attempts. Same
  // (email, IP) composite subject gives equivalent brute-force
  // resistance; the limit is per (email, source IP) at 5/hour.
  password_reset_request: { limit: 5, windowSeconds: 60 * 60 },
  // Upload-sign request: 60 per 10 minutes per signed-in user. A single
  // multi-file upload can ask for several sign URLs in quick succession
  // (logo + color swatch + font file + document = 4 in one click), so
  // the budget is generous; the threat is an authenticated user or
  // leaked session token farm-running the route to exhaust the storage
  // quota or harvest signed PUT URLs.
  upload_sign: { limit: 60, windowSeconds: 10 * 60 },
  // M3 — platform admins can file a support access request up to
  // 10 times per hour; the agency admin can decide up to 30 times
  // per hour. Both are tunable in production if abuse appears.
  support_access_request: { limit: 10, windowSeconds: 60 * 60 },
  support_access_decision: { limit: 30, windowSeconds: 60 * 60 },
};

export function rateLimitRuleFor(scope: RateLimitScope) {
  return RULES[scope];
}

export function hashRateLimitSubject(subject: string, secret: string): string {
  return createHash("sha256").update(`${secret}:${subject.trim().toLowerCase()}`).digest("hex");
}

export type RateLimitResult =
  { allowed: true; remaining: number } | { allowed: false; retryAfterSeconds: number };

/**
 * Database-backed fixed-window limiter. The transaction-level advisory lock
 * makes the count-and-insert decision safe across all application instances.
 */
export async function enforceRateLimit(input: {
  scope: RateLimitScope;
  subject: string;
  actorId?: string;
  requestId?: string;
}): Promise<RateLimitResult> {
  const rule = rateLimitRuleFor(input.scope);
  const secret = serverEnv.AUTH_SECRET;
  if (!secret) throw new Error("Rate limiting requires AUTH_SECRET");
  const subjectHash = hashRateLimitSubject(input.subject, secret);
  const startedAt = new Date(Date.now() - rule.windowSeconds * 1000);

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`${input.scope}:${subjectHash}`}))`,
    );
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(rateLimitEvents)
      .where(
        and(
          eq(rateLimitEvents.scope, input.scope),
          eq(rateLimitEvents.subjectHash, subjectHash),
          gte(rateLimitEvents.occurredAt, startedAt),
        ),
      );
    const count = row?.count ?? 0;

    if (count >= rule.limit) {
      await tx.insert(securityAuditEvents).values({
        ...(input.actorId ? { actorId: input.actorId } : {}),
        action: input.scope,
        targetType: "rate_limit",
        targetId: subjectHash.slice(0, 16),
        outcome: "denied",
        ...(input.requestId ? { requestId: input.requestId } : {}),
        metadata: { reason: "rate_limit_exceeded", windowSeconds: rule.windowSeconds },
      });
      return { allowed: false, retryAfterSeconds: rule.windowSeconds };
    }

    await tx.insert(rateLimitEvents).values({ scope: input.scope, subjectHash });
    return { allowed: true, remaining: rule.limit - count - 1 };
  });
}
