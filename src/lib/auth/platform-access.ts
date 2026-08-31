import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { platformAdministrators } from "@/lib/db/schema";
import { logWarn } from "@/lib/observability/logger";
import { captureError } from "@/lib/observability/sentry";
import { PermissionDeniedError, type Actor } from "@/lib/auth/policy";
import { PLATFORM_ROLE_VALUES, type PlatformRole } from "@/lib/auth/platform-access-types";

export const PLATFORM_PERMISSIONS = [
  "platform.console.read",
  // M4.7 / Phase 3 of the social-cron-admin plan: the right
  // to trigger a manual Run-now for an in-app cron from the
  // platform-admin Cron health page. Distinct from
  // `console.read` so read-only platform auditors cannot
  // trigger writes against the provider.
  "platform.console.manage",
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
  // Owner-only kill switch. Grants the holder the right to run
  // irreversible operations (e.g. "reset idea" — hard delete of a
  // content item + all cascade children) that produce no undo log.
  // Any new destructive feature MUST go through this permission; do
  // not introduce a parallel email-domain or per-feature gate.
  "platform.destructive.execute",
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
  support_operator: ["platform.console.read", "platform.agency.read", "platform.support.request"],
};

const PlatformRoleSchema = z.enum(PLATFORM_ROLE_VALUES);

export function permissionsForPlatformRole(role: PlatformRole): ReadonlySet<PlatformPermission> {
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
    captureError("platform_access.lookup_failed", error, { actorId: actor.id });
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
