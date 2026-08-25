import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { platformAdministrators } from "@/lib/db/schema";
import { logError, logWarn } from "@/lib/observability/logger";
import { PermissionDeniedError, type Actor } from "@/lib/auth/policy";
import {
  PLATFORM_ROLE_VALUES,
  type PlatformRole,
} from "@/lib/auth/platform-access-types";

export const PLATFORM_PERMISSIONS = [
  "platform.console.read",
  "platform.agency.read",
  "platform.agency.create",
  "platform.agency.update",
  "platform.agency.plan.manage",
  "platform.agency.lifecycle.manage",
  "platform.agency.archive",
  "platform.support.request",
  "platform.access.read",
  "platform.access.manage",
  "platform.audit.read",
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

export type PlatformPrincipal = Readonly<{
  actor: Actor;
  role: PlatformRole;
  permissions: ReadonlySet<PlatformPermission>;
}>;

const ROLE_PERMISSIONS: Record<PlatformRole, readonly PlatformPermission[]> = {
  platform_owner: PLATFORM_PERMISSIONS,
  agency_operator: [
    "platform.console.read",
    "platform.agency.read",
    "platform.agency.create",
    "platform.agency.update",
    "platform.agency.plan.manage",
    "platform.agency.lifecycle.manage",
  ],
  platform_auditor: [
    "platform.console.read",
    "platform.agency.read",
    "platform.access.read",
    "platform.audit.read",
  ],
  support_operator: [
    "platform.console.read",
    "platform.agency.read",
    "platform.support.request",
  ],
};

const PlatformRoleSchema = z.enum(PLATFORM_ROLE_VALUES);

export function permissionsForPlatformRole(
  role: PlatformRole,
): ReadonlySet<PlatformPermission> {
  return new Set(ROLE_PERMISSIONS[role]);
}

/**
 * Resolve one active platform assignment into its server-only principal.
 * Missing, revoked, malformed, and unavailable records all fail closed.
 */
export async function getPlatformPrincipal(actor: Actor): Promise<PlatformPrincipal | null> {
  try {
    const [row] = await db
      .select({ role: platformAdministrators.role })
      .from(platformAdministrators)
      .where(
        and(eq(platformAdministrators.userId, actor.id), isNull(platformAdministrators.revokedAt)),
      )
      .limit(1);
    if (!row) return null;

    const role = PlatformRoleSchema.parse(row.role);
    return {
      actor,
      role,
      permissions: permissionsForPlatformRole(role),
    };
  } catch (error) {
    logError("platform_access.lookup_failed", { actorId: actor.id, error });
    return null;
  }
}

export async function hasPlatformPermission(
  actor: Actor,
  permission: PlatformPermission,
): Promise<boolean> {
  const principal = await getPlatformPrincipal(actor);
  const allowed = principal?.permissions.has(permission) === true;
  if (!allowed) {
    logWarn("platform_access.denied", {
      actorId: actor.id,
      permission,
      role: principal?.role ?? null,
    });
  }
  return allowed;
}

export async function requirePlatformPermission(
  actor: Actor,
  permission: PlatformPermission,
): Promise<PlatformPrincipal> {
  const principal = await getPlatformPrincipal(actor);
  if (!principal?.permissions.has(permission)) {
    logWarn("platform_access.denied", {
      actorId: actor.id,
      permission,
      role: principal?.role ?? null,
    });
    throw new PermissionDeniedError(`platform-permission:${permission}`);
  }
  return principal;
}
