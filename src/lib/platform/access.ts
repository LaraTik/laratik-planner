import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { platformAdministrators, securityAuditEvents, users } from "@/lib/db/schema";
import { requirePlatformPermission } from "@/lib/auth/platform-access";
import {
  PLATFORM_ROLE_VALUES,
  type PlatformRole,
} from "@/lib/auth/platform-access-types";
import type { Actor } from "@/lib/auth/policy";
import { logError } from "@/lib/observability/logger";

const PlatformRoleSchema = z.enum(PLATFORM_ROLE_VALUES);

export const GrantPlatformAccessSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: PlatformRoleSchema,
  reason: z.string().trim().min(3).max(500),
});

export const ChangePlatformRoleSchema = z.object({
  userId: z.string().uuid(),
  role: PlatformRoleSchema,
  reason: z.string().trim().min(3).max(500),
});

export const RevokePlatformAccessSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

export type GrantPlatformAccessInput = z.infer<typeof GrantPlatformAccessSchema>;
export type ChangePlatformRoleInput = z.infer<typeof ChangePlatformRoleSchema>;
export type RevokePlatformAccessInput = z.infer<typeof RevokePlatformAccessSchema>;

export type PlatformAccessMutationResult = Readonly<{
  userId: string;
  role: PlatformRole;
  unchanged: boolean;
}>;

export type PlatformAccessRow = Readonly<{
  userId: string;
  email: string;
  displayName: string;
  role: PlatformRole;
  grantedByUserId: string | null;
  grantedByEmail: string | null;
  grantedAt: Date;
  updatedAt: Date;
  reason: string | null;
}>;

export type PlatformAccessAuditRow = Readonly<{
  id: number;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  outcome: string;
  metadata: unknown;
  createdAt: Date;
}>;

const PLATFORM_ACCESS_LOCK_KEY = 6_421_910_731;
type PlatformAccessTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockPlatformAccess(tx: PlatformAccessTransaction): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${PLATFORM_ACCESS_LOCK_KEY})`);
}

function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as T[]) : [];
  }
  return [];
}

export async function listPlatformAccess(actor: Actor): Promise<PlatformAccessRow[]> {
  await requirePlatformPermission(actor, "platform.access.read");
  const result = await db.execute(sql`
    SELECT
      pa.user_id,
      u.email,
      u.display_name,
      pa.role,
      pa.granted_by,
      pa.granted_at,
      pa.updated_at,
      pa.reason,
      grantor.email AS grantor_email
    FROM platform_administrator pa
    INNER JOIN "user" u ON u.id = pa.user_id
    LEFT JOIN "user" grantor ON grantor.id = pa.granted_by
    WHERE pa.revoked_at IS NULL
    ORDER BY
      CASE pa.role
        WHEN 'platform_owner' THEN 0
        WHEN 'agency_operator' THEN 1
        WHEN 'support_operator' THEN 2
        ELSE 3
      END,
      lower(u.email)
  `);

  return resultRows<{
    user_id: string;
    email: string;
    display_name: string;
    role: unknown;
    granted_by: string | null;
    granted_at: Date;
    updated_at: Date;
    reason: string | null;
    grantor_email: string | null;
  }>(result).map((row) => ({
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: PlatformRoleSchema.parse(row.role),
    grantedByUserId: row.granted_by,
    grantedByEmail: row.grantor_email,
    grantedAt: row.granted_at,
    updatedAt: row.updated_at,
    reason: row.reason,
  }));
}

export async function listPlatformAccessAudit(
  actor: Actor,
  limit = 20,
): Promise<PlatformAccessAuditRow[]> {
  await requirePlatformPermission(actor, "platform.access.read");
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  return db
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
    .where(
      sql`${securityAuditEvents.action} IN ('platform_access.grant', 'platform_access.role_change', 'platform_access.revoke')`,
    )
    .orderBy(desc(securityAuditEvents.createdAt))
    .limit(safeLimit);
}

export async function grantPlatformAccess(
  actor: Actor,
  raw: GrantPlatformAccessInput,
): Promise<PlatformAccessMutationResult> {
  await requirePlatformPermission(actor, "platform.access.manage");
  const input = GrantPlatformAccessSchema.parse(raw);

  return db.transaction(async (tx) => {
    await lockPlatformAccess(tx);

    const [user] = await tx
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(sql`lower(${users.email}) = ${input.email}`)
      .limit(1);
    if (!user) {
      throw new PlatformAccessServiceError(
        PlatformAccessErrorCode.UserNotFound,
        "No existing user has that email. They must sign in once before access can be granted.",
      );
    }

    const [existing] = await tx
      .select({
        userId: platformAdministrators.userId,
        role: platformAdministrators.role,
        revokedAt: platformAdministrators.revokedAt,
      })
      .from(platformAdministrators)
      .where(eq(platformAdministrators.userId, user.id))
      .limit(1);

    if (existing && !existing.revokedAt) {
      if (existing.role === input.role) {
        return { userId: existing.userId, role: existing.role, unchanged: true };
      }
      throw new PlatformAccessServiceError(
        PlatformAccessErrorCode.AlreadyActive,
        "This person already has platform access. Change their role from the assignment list.",
        { userId: existing.userId, role: existing.role },
      );
    }

    const changedAt = new Date();
    if (existing) {
      await tx
        .update(platformAdministrators)
        .set({
          role: input.role,
          grantedBy: actor.id,
          grantedAt: changedAt,
          revokedAt: null,
          reason: input.reason,
          updatedAt: changedAt,
        })
        .where(eq(platformAdministrators.userId, user.id));
    } else {
      await tx.insert(platformAdministrators).values({
        userId: user.id,
        role: input.role,
        grantedBy: actor.id,
        grantedAt: changedAt,
        reason: input.reason,
        updatedAt: changedAt,
      });
    }

    await tx.insert(securityAuditEvents).values({
      actorId: actor.id,
      action: "platform_access.grant",
      targetType: "user",
      targetId: user.id,
      outcome: "success",
      metadata: {
        targetEmail: user.email,
        previousRole: existing?.role ?? null,
        newRole: input.role,
        reason: input.reason,
      },
    });

    return { userId: user.id, role: input.role, unchanged: false };
  });
}

export async function changePlatformRole(
  actor: Actor,
  raw: ChangePlatformRoleInput,
): Promise<PlatformAccessMutationResult> {
  await requirePlatformPermission(actor, "platform.access.manage");
  const input = ChangePlatformRoleSchema.parse(raw);

  return db.transaction(async (tx) => {
    await lockPlatformAccess(tx);
    const [target] = await tx
      .select({
        userId: platformAdministrators.userId,
        role: platformAdministrators.role,
        revokedAt: platformAdministrators.revokedAt,
        email: users.email,
      })
      .from(platformAdministrators)
      .innerJoin(users, eq(users.id, platformAdministrators.userId))
      .where(eq(platformAdministrators.userId, input.userId))
      .limit(1);
    if (!target || target.revokedAt) {
      throw new PlatformAccessServiceError(
        PlatformAccessErrorCode.NotFound,
        "No active platform access assignment was found for that user.",
        { userId: input.userId },
      );
    }
    if (target.role === input.role) {
      return { userId: target.userId, role: target.role, unchanged: true };
    }
    if (target.role === "platform_owner" && input.role !== "platform_owner") {
      await requireAnotherOwner(tx);
    }

    const changedAt = new Date();
    await tx
      .update(platformAdministrators)
      .set({ role: input.role, reason: input.reason, updatedAt: changedAt })
      .where(eq(platformAdministrators.userId, input.userId));
    await tx.insert(securityAuditEvents).values({
      actorId: actor.id,
      action: "platform_access.role_change",
      targetType: "user",
      targetId: input.userId,
      outcome: "success",
      metadata: {
        targetEmail: target.email,
        previousRole: target.role,
        newRole: input.role,
        reason: input.reason,
      },
    });
    return { userId: target.userId, role: input.role, unchanged: false };
  });
}

export async function revokePlatformAccess(
  actor: Actor,
  raw: RevokePlatformAccessInput,
): Promise<PlatformAccessMutationResult> {
  await requirePlatformPermission(actor, "platform.access.manage");
  const input = RevokePlatformAccessSchema.parse(raw);

  return db.transaction(async (tx) => {
    await lockPlatformAccess(tx);
    const [target] = await tx
      .select({
        userId: platformAdministrators.userId,
        role: platformAdministrators.role,
        revokedAt: platformAdministrators.revokedAt,
        email: users.email,
      })
      .from(platformAdministrators)
      .innerJoin(users, eq(users.id, platformAdministrators.userId))
      .where(eq(platformAdministrators.userId, input.userId))
      .limit(1);
    if (!target) {
      throw new PlatformAccessServiceError(
        PlatformAccessErrorCode.NotFound,
        "No platform access assignment was found for that user.",
        { userId: input.userId },
      );
    }
    if (target.revokedAt) {
      return { userId: target.userId, role: target.role, unchanged: true };
    }
    if (target.role === "platform_owner") {
      await requireAnotherOwner(tx);
    }

    const changedAt = new Date();
    await tx
      .update(platformAdministrators)
      .set({ revokedAt: changedAt, reason: input.reason, updatedAt: changedAt })
      .where(eq(platformAdministrators.userId, input.userId));
    await tx.insert(securityAuditEvents).values({
      actorId: actor.id,
      action: "platform_access.revoke",
      targetType: "user",
      targetId: input.userId,
      outcome: "success",
      metadata: {
        targetEmail: target.email,
        previousRole: target.role,
        newRole: null,
        reason: input.reason,
      },
    });
    return { userId: target.userId, role: target.role, unchanged: false };
  });
}

async function requireAnotherOwner(tx: PlatformAccessTransaction): Promise<void> {
  const [countRow] = await tx
    .select({ value: sql<number>`count(*)::int` })
    .from(platformAdministrators)
    .where(
      and(
        eq(platformAdministrators.role, "platform_owner"),
        isNull(platformAdministrators.revokedAt),
      ),
    );
  const activeOwnerCount = Number(countRow?.value ?? 0);
  if (activeOwnerCount <= 1) {
    throw new PlatformAccessServiceError(
      PlatformAccessErrorCode.LastOwner,
      "At least one active Platform Owner must remain. Add another Owner before changing this assignment.",
      { activeOwnerCount },
    );
  }
}

export const PlatformAccessErrorCode = {
  NotFound: "platform_access.not-found",
  UserNotFound: "platform_access.user-not-found",
  AlreadyActive: "platform_access.already-active",
  LastOwner: "platform_access.last-owner",
} as const;
export type PlatformAccessErrorCode =
  (typeof PlatformAccessErrorCode)[keyof typeof PlatformAccessErrorCode];

export class PlatformAccessServiceError extends Error {
  public readonly code: PlatformAccessErrorCode;
  public readonly details: Record<string, unknown>;

  constructor(
    code: PlatformAccessErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "PlatformAccessServiceError";
    this.code = code;
    this.details = details;
    logError("platform_access.service_error", { code, message, details });
  }
}
