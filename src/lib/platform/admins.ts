import "server-only";
import { desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { platformAdministrators, securityAuditEvents, users } from "@/lib/db/schema";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import type { Actor } from "@/lib/auth/policy";
import { logError } from "@/lib/observability/logger";

/**
 * Platform Admin grant / revoke / list service (superadmin-clarity).
 *
 * The Platform Admin is the "superadmin" who controls agencies (not
 * their workspaces). Authority is held in the `platform_administrator`
 * table; the `isPlatformAdmin` helper filters `revoked_at IS NULL` so
 * soft-revoked grants are no longer live.
 *
 * Authority model (mirrors `src/lib/auth/platform-admin.ts`):
 *   - `grantPlatformAdmin` and `revokePlatformAdmin` both call
 *     `requirePlatformAdmin(actor)` first; only existing platform
 *     admins can change the grant set. The first-ever grant is
 *     intentionally **not** in this service — it is the documented
 *     SQL escape hatch in `docs/agency-setup.md §3.2`. The product UI
 *     refuses to grant to a non-existent user; auto-creating users
 *     from a Platform Admin grant would be a privilege-inflation
 *     footgun (an attacker could pre-grant a never-signed-in user).
 *   - `revokePlatformAdmin` refuses to revoke the last live platform
 *     admin. This is a lockout guard: if every platform admin
 *     revokes themselves the platform console becomes unreachable
 *     without SQL recovery.
 *   - Every state transition appends a row to `security_audit_events`
 *     with the action verb, the actor, the target, and a free-text
 *     `metadata` jsonb. The metadata is intentionally narrow:
 *     `grantorUserId`, `granteeUserId`, `reason`. No tenant content,
 *     no secrets.
 *
 * Self-revoke guard:
 *   - `revokePlatformAdmin` allows a platform admin to revoke
 *     themselves, but only when at least one other live admin
 *     remains. The check is the same last-admin guard.
 *
 * The helpers are pure-data: they do not consult the agency context,
 * they do not resolve the active agency, and they do not require
 * any agency membership. A platform admin with no agency membership
 * can still manage the grant set.
 */

export const GrantPlatformAdminSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  reason: z.string().trim().min(3).max(500),
});
export type GrantPlatformAdminInput = z.infer<typeof GrantPlatformAdminSchema>;

export const RevokePlatformAdminSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});
export type RevokePlatformAdminInput = z.infer<typeof RevokePlatformAdminSchema>;

export type PlatformAdminRow = {
  userId: string;
  email: string;
  displayName: string;
  grantedByUserId: string | null;
  grantedByEmail: string | null;
  grantedAt: Date;
  revokedAt: Date | null;
  reason: string | null;
};

export type PlatformAdminAuditRow = {
  id: number;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  outcome: string;
  metadata: unknown;
  createdAt: Date;
};

/**
 * List every live platform admin (revoked_at IS NULL) plus the
 * grantor email (best-effort LEFT JOIN; a null grantor email
 * indicates the original grant was done via SQL or by a user
 * later deleted).
 */
export async function listPlatformAdmins(): Promise<PlatformAdminRow[]> {
  const rows = await db.execute<{
    user_id: string;
    email: string;
    display_name: string;
    granted_by: string | null;
    granted_at: Date;
    revoked_at: Date | null;
    reason: string | null;
    grantor_email: string | null;
  }>(sql`
    SELECT
      pa.user_id,
      u.email,
      u.display_name,
      pa.granted_by,
      pa.granted_at,
      pa.revoked_at,
      pa.reason,
      g.email AS grantor_email
    FROM platform_administrator pa
    INNER JOIN "user" u ON u.id = pa.user_id
    LEFT JOIN platform_administrator gpa ON gpa.user_id = pa.granted_by AND gpa.revoked_at IS NULL
    LEFT JOIN "user" g ON g.id = gpa.user_id
    WHERE pa.revoked_at IS NULL
    ORDER BY pa.granted_at ASC
  `);
  return (rows as unknown as { rows?: typeof rows.rows } & typeof rows).rows
    ? (
        rows as unknown as {
          rows: Array<{
            user_id: string;
            email: string;
            display_name: string;
            granted_by: string | null;
            granted_at: Date;
            revoked_at: Date | null;
            reason: string | null;
            grantor_email: string | null;
          }>;
        }
      ).rows.map((r) => ({
        userId: r.user_id,
        email: r.email,
        displayName: r.display_name,
        grantedByUserId: r.granted_by,
        grantedByEmail: r.grantor_email,
        grantedAt: r.granted_at,
        revokedAt: r.revoked_at,
        reason: r.reason,
      }))
    : [];
}

/**
 * Grant a platform admin by email. The user must already exist
 * (have signed in at least once). If the user already has a
 * non-revoked grant, the call is idempotent and returns the
 * existing grant. If the user has a previously-revoked grant,
 * the grant is re-activated (revoked_at is set to null).
 */
export async function grantPlatformAdmin(
  actor: Actor,
  raw: GrantPlatformAdminInput,
): Promise<{ userId: string; alreadyGranted: boolean }> {
  await requirePlatformAdmin(actor);
  const input = GrantPlatformAdminSchema.parse(raw);

  // Look up the user by email (case-insensitive). Refuse to
  // auto-create — that would let an attacker pre-grant a never-
  // signed-in email.
  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(sql`lower(${users.email}) = ${input.email}`)
    .limit(1);
  if (!user) {
    throw new PlatformAdminServiceError(
      PlatformAdminErrorCode.UserNotFound,
      `No user with email ${input.email}. They must sign in at least once before being granted platform admin.`,
      { email: input.email },
    );
  }

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        userId: platformAdministrators.userId,
        revokedAt: platformAdministrators.revokedAt,
      })
      .from(platformAdministrators)
      .where(eq(platformAdministrators.userId, user.id))
      .limit(1);

    if (existing && !existing.revokedAt) {
      // Idempotent — already a live grant.
      return { userId: existing.userId, alreadyGranted: true };
    }

    if (existing) {
      // Re-activate a soft-revoked row.
      await tx
        .update(platformAdministrators)
        .set({
          grantedBy: actor.id,
          grantedAt: new Date(),
          revokedAt: null,
          reason: input.reason,
        })
        .where(eq(platformAdministrators.userId, user.id));
    } else {
      await tx.insert(platformAdministrators).values({
        userId: user.id,
        grantedBy: actor.id,
        reason: input.reason,
      });
    }

    await tx.insert(securityAuditEvents).values({
      actorId: actor.id,
      action: "platform_admin.grant",
      targetType: "user",
      targetId: user.id,
      outcome: "success",
      metadata: {
        granteeEmail: input.email,
        reason: input.reason,
      },
    });

    revalidatePath("/app/platform/admins");
    return { userId: user.id, alreadyGranted: false };
  });
}

/**
 * Soft-revoke a platform admin. The grant row stays in the table
 * for the audit trail; `isPlatformAdmin` filters `revoked_at IS NULL`.
 *
 * Refuses to revoke the last live platform admin. The lockout
 * guard is a single COUNT(*) inside the transaction.
 */
export async function revokePlatformAdmin(
  actor: Actor,
  raw: RevokePlatformAdminInput,
): Promise<{ userId: string }> {
  await requirePlatformAdmin(actor);
  const input = RevokePlatformAdminSchema.parse(raw);

  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({
        userId: platformAdministrators.userId,
        revokedAt: platformAdministrators.revokedAt,
      })
      .from(platformAdministrators)
      .where(eq(platformAdministrators.userId, input.userId))
      .limit(1);
    if (!target) {
      throw new PlatformAdminServiceError(
        PlatformAdminErrorCode.NotFound,
        "No platform admin grant found for that user.",
        { userId: input.userId },
      );
    }
    if (target.revokedAt) {
      // Idempotent — already revoked.
      return { userId: target.userId };
    }

    const [countRow] = await tx
      .select({ value: sql<number>`count(*)::int` })
      .from(platformAdministrators)
      .where(isNull(platformAdministrators.revokedAt));
    const liveCount = Number(countRow?.value ?? 0);
    if (liveCount <= 1) {
      throw new PlatformAdminServiceError(
        PlatformAdminErrorCode.LastAdmin,
        "Refusing to revoke the last live platform admin. Grant the role to another user first.",
        { liveCount },
      );
    }

    await tx
      .update(platformAdministrators)
      .set({
        revokedAt: new Date(),
        reason: input.reason,
      })
      .where(eq(platformAdministrators.userId, input.userId));

    await tx.insert(securityAuditEvents).values({
      actorId: actor.id,
      action: "platform_admin.revoke",
      targetType: "user",
      targetId: input.userId,
      outcome: "success",
      metadata: {
        reason: input.reason,
      },
    });

    revalidatePath("/app/platform/admins");
    return { userId: input.userId };
  });
}

/**
 * Read the last 20 audit rows for platform-admin grant / revoke
 * actions. Returns the most recent first.
 */
export async function listPlatformAdminAudit(limit = 20): Promise<PlatformAdminAuditRow[]> {
  const rows = await db
    .select({
      id: securityAuditEvents.id,
      actorId: securityAuditEvents.actorId,
      action: securityAuditEvents.action,
      targetType: securityAuditEvents.targetType,
      targetId: securityAuditEvents.targetId,
      outcome: securityAuditEvents.outcome,
      metadata: securityAuditEvents.metadata,
      createdAt: securityAuditEvents.createdAt,
    })
    .from(securityAuditEvents)
    .where(sql`${securityAuditEvents.action} IN ('platform_admin.grant', 'platform_admin.revoke')`)
    .orderBy(desc(securityAuditEvents.createdAt))
    .limit(limit);
  return rows as PlatformAdminAuditRow[];
}

// ─── Error model ────────────────────────────────────────────────────────

export const PlatformAdminErrorCode = {
  NotFound: "platform_admin.not-found",
  UserNotFound: "platform_admin.user-not-found",
  LastAdmin: "platform_admin.last-admin",
} as const;
export type PlatformAdminErrorCode =
  (typeof PlatformAdminErrorCode)[keyof typeof PlatformAdminErrorCode];

export class PlatformAdminServiceError extends Error {
  public readonly code: PlatformAdminErrorCode;
  public readonly details: Record<string, unknown>;
  constructor(
    code: PlatformAdminErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "PlatformAdminServiceError";
    this.code = code;
    this.details = details;
    // If a route catches this and falls through to a generic 500,
    // log the error so the platform-misconfiguration is visible.
    logError("platform_admins.service_error", { code, message, details });
  }
}
