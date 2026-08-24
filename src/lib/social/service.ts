import "server-only";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { securityAuditEvents, socialConnections } from "@/lib/db/schema";
import { isAgencyAdmin, type Actor } from "@/lib/auth/policy";
import {
  DekAlreadyEnabledError,
  DekNotEnabledError,
  DekRotationError,
  disableAgencyDek,
  enableAgencyDek,
  getAgencySocialStatus,
  isKekAvailable,
  MissingKekError,
  rotateAgencyDek,
} from "./key-management";

/**
 * M4.5 — per-agency social DEK service layer.
 *
 * Wraps the `key-management` primitives with the
 * authorization + audit-log + error-translation surface that the
 * agency admin API routes need. The route handlers are thin:
 *
 *   - Authenticate the actor (NextAuth session)
 *   - Verify the actor is an agency admin for the named agency
 *   - Call the service function
 *   - Translate the typed error to the right HTTP status
 *   - Return the JSON response (the `dekRecoveryKey` is only
 *     present in `enable` and `rotate` responses, never logged)
 *
 * Error surface (the service throws a typed error; the route
 * maps to an HTTP status):
 *
 *   - MissingKekError         → 503 `platform_kek_missing`
 *   - DekAlreadyEnabledError  → 409 `social_already_enabled`
 *   - DekNotEnabledError      → 404 `social_not_enabled`
 *   - DekRotationError        → 500 `dek_unwrap_failed`
 *
 * Every mutation writes a `security_audit_event` row with the
 * actor id, the action verb, the agency id, the outcome, and a
 * small metadata jsonb (e.g. `dekKeyVersion`). The DEK plaintext
 * is NEVER in the audit row.
 */

export const ConfirmSchema = z.object({
  confirm: z.literal(true),
});

export class SocialServiceError extends Error {
  public readonly code:
    | "social.forbidden"
    | "social.not-found"
    | "social.platform-kek-missing"
    | "social.already-enabled"
    | "social.not-enabled"
    | "social.dek-rotation-failed"
    | "social.invalid-input";
  public readonly status: number;
  constructor(
    code: SocialServiceError["code"],
    message: string,
    status: number,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "SocialServiceError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Map a key-management error to a SocialServiceError. Returns the
 * error so the caller can `throw` it.
 */
function translateKeyManagementError(err: unknown): SocialServiceError {
  if (err instanceof MissingKekError) {
    return new SocialServiceError(
      "social.platform-kek-missing",
      "The platform administrator must set SOCIAL_TOKEN_ENCRYPTION_KEY before agencies can enable social analytics.",
      503,
    );
  }
  if (err instanceof DekAlreadyEnabledError) {
    return new SocialServiceError(
      "social.already-enabled",
      "Social analytics is already enabled for this agency",
      409,
    );
  }
  if (err instanceof DekNotEnabledError) {
    return new SocialServiceError(
      "social.not-enabled",
      "Social analytics is not enabled for this agency",
      404,
    );
  }
  if (err instanceof DekRotationError) {
    return new SocialServiceError(
      "social.dek-rotation-failed",
      "Unable to decrypt the agency DEK envelope. The platform KEK may have been rotated without running the re-wrap script.",
      500,
      { code: err.code },
    );
  }
  return new SocialServiceError(
    "social.dek-rotation-failed",
    err instanceof Error ? err.message : "Unknown error",
    500,
  );
}

// ─── Read surface ─────────────────────────────────────────────────────────

/**
 * Get the social status for an agency. Pure read.
 */
export async function getSocialStatus(actor: Actor, agencyId: string) {
  if (!(await isAgencyAdmin(actor, agencyId))) {
    throw new SocialServiceError("social.forbidden", "Agency admin required", 403);
  }
  const status = await getAgencySocialStatus(db, agencyId);
  const connectionCount = await countConnectionsForAgency(agencyId);
  return {
    ...status,
    connectionCount,
    platformKekAvailable: isKekAvailable(),
  };
}

async function countConnectionsForAgency(agencyId: string): Promise<number> {
  // Drizzle: count social_connection rows whose workspace belongs
  // to the given agency. We import the workspace table inline
  // because it is already in the barrel re-export and the import
  // graph resolves at module load.
  const { workspaces } = await import("@/lib/db/schema");
  const rows = await db
    .select({ id: socialConnections.id })
    .from(socialConnections)
    .innerJoin(workspaces, eq(socialConnections.workspaceId, workspaces.id))
    .where(eq(workspaces.agencyId, agencyId));
  return rows.length;
}

// ─── Mutate surface ───────────────────────────────────────────────────────

/**
 * Enable social analytics for an agency. Generates a fresh DEK,
 * wraps it with the platform KEK, and returns the plaintext DEK
 * (base64) to the caller ONCE.
 */
export async function enableSocial(
  actor: Actor,
  agencyId: string,
): Promise<{ dekRecoveryKey: string; dekKeyVersion: number }> {
  if (!(await isAgencyAdmin(actor, agencyId))) {
    throw new SocialServiceError("social.forbidden", "Agency admin required", 403);
  }
  try {
    const result = await enableAgencyDek(db, { agencyId, actorId: actor.id });
    await writeAudit(actor, agencyId, "social.enable", "success", {
      dekKeyVersion: result.dekKeyVersion,
    });
    return result;
  } catch (err) {
    await writeAudit(actor, agencyId, "social.enable", "failed", {
      code: err instanceof Error ? err.name : "unknown",
    });
    if (err instanceof SocialServiceError) throw err;
    throw translateKeyManagementError(err);
  }
}

/**
 * Rotate the agency DEK. Re-seals every social_connection in the
 * agency inside a single FOR UPDATE row lock. Returns the new
 * plaintext DEK ONCE.
 */
export async function rotateSocialDek(
  actor: Actor,
  agencyId: string,
  rawBody: unknown,
): Promise<{ dekRecoveryKey: string; dekKeyVersion: number }> {
  if (!(await isAgencyAdmin(actor, agencyId))) {
    throw new SocialServiceError("social.forbidden", "Agency admin required", 403);
  }
  const body = ConfirmSchema.safeParse(rawBody);
  if (!body.success) {
    throw new SocialServiceError(
      "social.invalid-input",
      "Body must include `{ confirm: true }`",
      400,
    );
  }
  try {
    const result = await rotateAgencyDek(db, {
      agencyId,
      actorId: actor.id,
      reason: "manual",
    });
    await writeAudit(actor, agencyId, "social.dek.rotate", "success", {
      dekKeyVersion: result.dekKeyVersion,
    });
    return result;
  } catch (err) {
    await writeAudit(actor, agencyId, "social.dek.rotate", "failed", {
      code: err instanceof Error ? err.name : "unknown",
    });
    if (err instanceof SocialServiceError) throw err;
    throw translateKeyManagementError(err);
  }
}

/**
 * Reset the DEK recovery for an agency that lost their recovery
 * key. Disconnects every social_connection in the agency (preserves
 * audit + metric history) and deletes the DEK row. The agency
 * must re-enable social to use it again.
 *
 * Note: the "reset" is destructive. The function does NOT show
 * a new recovery key — the agency admin must re-enable social
 * afterwards, which generates a fresh DEK and shows the recovery
 * key on the enable response.
 */
export async function resetSocialRecovery(
  actor: Actor,
  agencyId: string,
  rawBody: unknown,
): Promise<{ ok: true }> {
  if (!(await isAgencyAdmin(actor, agencyId))) {
    throw new SocialServiceError("social.forbidden", "Agency admin required", 403);
  }
  const body = ConfirmSchema.safeParse(rawBody);
  if (!body.success) {
    throw new SocialServiceError(
      "social.invalid-input",
      "Body must include `{ confirm: true }`",
      400,
    );
  }
  try {
    await disableAgencyDek(db, { agencyId });
    await writeAudit(actor, agencyId, "social.dek.reset-recovery", "success", {});
    return { ok: true };
  } catch (err) {
    await writeAudit(actor, agencyId, "social.dek.reset-recovery", "failed", {
      code: err instanceof Error ? err.name : "unknown",
    });
    if (err instanceof SocialServiceError) throw err;
    throw translateKeyManagementError(err);
  }
}

/**
 * Disable social analytics for an agency. Disconnects every
 * social_connection (preserves audit + metric history) and
 * deletes the DEK row.
 */
export async function disableSocial(
  actor: Actor,
  agencyId: string,
  rawBody: unknown,
): Promise<{ ok: true }> {
  if (!(await isAgencyAdmin(actor, agencyId))) {
    throw new SocialServiceError("social.forbidden", "Agency admin required", 403);
  }
  const body = ConfirmSchema.safeParse(rawBody);
  if (!body.success) {
    throw new SocialServiceError(
      "social.invalid-input",
      "Body must include `{ confirm: true }`",
      400,
    );
  }
  try {
    await disableAgencyDek(db, { agencyId });
    await writeAudit(actor, agencyId, "social.disable", "success", {});
    return { ok: true };
  } catch (err) {
    await writeAudit(actor, agencyId, "social.disable", "failed", {
      code: err instanceof Error ? err.name : "unknown",
    });
    if (err instanceof SocialServiceError) throw err;
    throw translateKeyManagementError(err);
  }
}

// ─── Audit ────────────────────────────────────────────────────────────────

/**
 * Write a security_audit_event row. The metadata is a small
 * jsonb that never contains the DEK plaintext, the KEK, or any
 * provider credentials. The fingerprint is the last 4 bytes of
 * sha256(dek_recovery_key) IF the recovery key is part of the
 * result — used only in the success path; the failure path
 * never has the recovery key.
 */
async function writeAudit(
  actor: Actor,
  agencyId: string,
  action: string,
  outcome: "success" | "failed" | "denied",
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(securityAuditEvents).values({
      actorId: actor.id,
      action,
      targetType: "agency",
      targetId: agencyId,
      outcome,
      metadata: {
        ...metadata,
        // Audit the agency id in two places: targetId (denormalised
        // for the audit-trail UI) and metadata.agency_id (so the
        // row is self-describing).
        agency_id: agencyId,
      },
    });
  } catch {
    // Audit failures must never break the primary action. Log
    // and move on.
    console.error(`[social.service] failed to write audit event ${action} for agency ${agencyId}`);
  }
}

// ─── KeK fingerprint (audit-only) ─────────────────────────────────────────

/**
 * Compute a stable fingerprint of a 32-byte key for the audit log.
 * The fingerprint is the last 4 bytes of sha256(key), hex-encoded.
 * Never use this to compare keys at runtime — it is intentionally
 * low-entropy to avoid becoming a covert channel.
 */
export function keyFingerprint(key: Buffer): string {
  if (!Buffer.isBuffer(key) || key.length === 0) return "";
  return createHash("sha256").update(key).digest("hex").slice(-8);
}
