import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCM,
  type DecipherGCM,
} from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { db as appDb } from "@/lib/db";
import { agencySocialDek, socialConnections, workspaces } from "@/lib/db/schema";
import { serverEnv } from "@/lib/validation/env";
import { deriveDevKey } from "@/lib/security/dev-key";
import { openCredentialsWithDek, sealCredentialsWithDek } from "./crypto";
import { socialChannels } from "@/lib/db/schema/channels";

// NOTE: this module does NOT import `server-only` because it is
// also consumed by `scripts/rotate-social-kek.ts`, which runs
// outside the Next.js runtime. The module is still server-only
// in practice: the `db` and `socialChannels` / `socialConnections`
// imports would fail to bundle in a client context.

/**
 * M4.5 — per-agency social DEK + lazy platform KEK.
 *
 * Replaces the single platform env-var SOCIAL_TOKEN_ENCRYPTION_KEY with:
 *
 *   - a **platform KEK** (Key Encryption Key) read from the env var on
 *     demand. The env var is OPTIONAL at boot; the first call to
 *     `getKekOrThrow` that needs it surfaces a `MissingKekError`.
 *
 *   - a **per-agency DEK** (Data Encryption Key) generated when an
 *     agency first enables social, wrapped by the KEK, and stored in
 *     `agency_social_dek`. The plaintext DEK is shown to the agency
 *     admin exactly once at enable / rotate / reset-recovery time and
 *     is NEVER persisted.
 *
 * The wrapped DEK envelope uses AES-256-GCM with AAD
 * `laratik-planner:social-dek:v1`. This AAD is distinct from the
 * per-connection social-credentials AAD
 * `laratik-planner:social-credentials:v1` so a future rotation of
 * either envelope does not drag the other along.
 *
 * Concurrency:
 *
 *   - `enableAgencyDek` uses `INSERT ... ON CONFLICT DO NOTHING` so a
 *     double-click does not produce two rows. The caller treats a
 *     missing return as `409 already_enabled`.
 *   - `rotateAgencyDek` and `disableAgencyDek` take a row-level lock
 *     on `agency_social_dek` and hold it across the cascade, so a
 *     concurrent cron tick for the same agency waits.
 *   - `getDekForAgency` is read-only and uses a per-request
 *     `Map<agencyId, Buffer>` cache so two calls in the same request
 *     cost one DB round trip. The map is created at the API route
 *     entry point (see `createDekCache`) and discarded after.
 *
 * Failure model:
 *
 *   - `MissingKekError` — production env is missing the KEK. Routes
 *     translate to `503 platform_kek_missing` with a message that
 *     names the env var.
 *   - `DekNotEnabledError` — agency has not enabled social. Routes
 *     translate to `404 social_not_enabled`.
 *   - `DekRotationError` — wrapped DEK is corrupted or the KEK is
 *     wrong. Routes translate to `500 dek_unwrap_failed` with a
 *     sanitized message.
 *
 * The helpers never `console.log` the DEK or the KEK. The audit log
 * is the place for enable / rotate / disable events; key material is
 * never written to it.
 */

// ─── Constants ─────────────────────────────────────────────────────────────

const KEK_BYTES = 32;
const DEK_BYTES = 32;
const IV_BYTES = 12;
const DEK_AAD = Buffer.from("laratik-planner:social-dek:v1", "utf8");
const CURRENT_KEK_VERSION = 1 as const;

let loggedDevFallback = false;

// ─── Errors ────────────────────────────────────────────────────────────────

export class MissingKekError extends Error {
  constructor(envVar: string = "SOCIAL_TOKEN_ENCRYPTION_KEY") {
    super(
      `${envVar} is not set or is not exactly 32 bytes after base64 decode. ` +
        `Generate one with: openssl rand -base64 32`,
    );
    this.name = "MissingKekError";
  }
}

export class DekNotEnabledError extends Error {
  constructor(agencyId: string) {
    super(`Social analytics is not enabled for agency ${agencyId}`);
    this.name = "DekNotEnabledError";
  }
}

export class DekAlreadyEnabledError extends Error {
  constructor(agencyId: string) {
    super(`Social analytics is already enabled for agency ${agencyId}`);
    this.name = "DekAlreadyEnabledError";
  }
}

export class DekRotationError extends Error {
  public readonly code: "auth_failed" | "malformed";
  constructor(code: "auth_failed" | "malformed", message: string) {
    super(message);
    this.name = "DekRotationError";
    this.code = code;
  }
}

// ─── Types ─────────────────────────────────────────────────────────────────

export type Db = typeof appDb;

export type WrappedDek = {
  /** Raw ciphertext bytes. */
  ciphertext: Buffer;
  /** 12-byte IV (fresh per wrap). */
  iv: Buffer;
  /** 16-byte GCM auth tag. */
  tag: Buffer;
  /** KEK slot version (1 today). */
  keyVersion: typeof CURRENT_KEK_VERSION;
};

export type DekRotationReason = "manual" | "recovery_reset";

export type EnableResult = {
  /** The plaintext DEK, base64-encoded. Shown to the agency admin ONCE. */
  dekRecoveryKey: string;
  /** The KEK slot version (1 today). */
  dekKeyVersion: typeof CURRENT_KEK_VERSION;
};

export type RotateResult = EnableResult;

// ─── KEK loading ───────────────────────────────────────────────────────────

/**
 * Decode the platform KEK from the env var. The value must be
 * base64-encoded 32 bytes (AES-256). In dev / test, a derived
 * fallback is used so the rest of the app can boot without
 * configuration. In production, missing or wrong-length throws
 * `MissingKekError`.
 *
 * Lazy: never called at module load. Routes call this on first
 * wrap / unwrap of an agency DEK.
 */
export function getKekOrThrow(): Buffer {
  const raw = serverEnv.SOCIAL_TOKEN_ENCRYPTION_KEY;
  if (raw && raw.length > 0) {
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length === KEK_BYTES) {
      return decoded;
    }
    // Wrong length. In dev we still use the fallback (no crash on
    // misconfig) but in production we throw so the operator notices.
    if (serverEnv.NODE_ENV === "production") {
      throw new MissingKekError();
    }
  }
  if (serverEnv.NODE_ENV === "production") {
    throw new MissingKekError();
  }
  if (!loggedDevFallback) {
    console.error(
      "[social.key-management] SOCIAL_TOKEN_ENCRYPTION_KEY is not set or wrong length; " +
        "using a derived dev key. DO NOT deploy this configuration.",
    );
    loggedDevFallback = true;
  }
  return deriveDevKey();
}

/**
 * Lightweight availability check for callers that want to skip
 * rather than throw (the cron worker). Returns true when the KEK
 * is reachable (env var set + 32 bytes after base64, or in dev).
 * Never throws.
 */
export function isKekAvailable(): boolean {
  const raw = serverEnv.SOCIAL_TOKEN_ENCRYPTION_KEY;
  if (raw && raw.length > 0) {
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length === KEK_BYTES) return true;
  }
  return serverEnv.NODE_ENV !== "production";
}

// ─── DEK wrap / unwrap (pure crypto) ───────────────────────────────────────

/**
 * Wrap a 32-byte DEK with the platform KEK. Returns the sealed
 * envelope. The IV is fresh for every call.
 */
export function wrapDek(dek: Buffer, kek: Buffer): WrappedDek {
  if (!Buffer.isBuffer(dek) || dek.length !== DEK_BYTES) {
    throw new DekRotationError("malformed", `DEK must be a ${DEK_BYTES}-byte Buffer`);
  }
  if (!Buffer.isBuffer(kek) || kek.length !== KEK_BYTES) {
    throw new DekRotationError("malformed", `KEK must be a ${KEK_BYTES}-byte Buffer`);
  }
  const iv = randomBytes(IV_BYTES);
  const cipher: CipherGCM = createCipheriv("aes-256-gcm", kek, iv);
  cipher.setAAD(DEK_AAD);
  const ciphertext = Buffer.concat([cipher.update(dek), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext, iv, tag, keyVersion: CURRENT_KEK_VERSION };
}

/**
 * Unwrap a DEK envelope. Throws `DekRotationError` on tampering,
 * wrong AAD, or wrong key. The error message is sanitized so it
 * never leaks the ciphertext, IV, or key material.
 */
export function unwrapDek(wrapped: WrappedDek, kek: Buffer): Buffer {
  if (
    !wrapped ||
    !Buffer.isBuffer(wrapped.ciphertext) ||
    !Buffer.isBuffer(wrapped.iv) ||
    !Buffer.isBuffer(wrapped.tag)
  ) {
    throw new DekRotationError("malformed", "DEK envelope is malformed");
  }
  if (wrapped.iv.length !== IV_BYTES) {
    throw new DekRotationError("malformed", "DEK envelope IV is wrong length");
  }
  if (!Buffer.isBuffer(kek) || kek.length !== KEK_BYTES) {
    throw new DekRotationError("malformed", "KEK is wrong length");
  }
  const decipher: DecipherGCM = createDecipheriv("aes-256-gcm", kek, wrapped.iv);
  decipher.setAAD(DEK_AAD);
  decipher.setAuthTag(wrapped.tag);
  try {
    return Buffer.concat([decipher.update(wrapped.ciphertext), decipher.final()]);
  } catch {
    throw new DekRotationError("auth_failed", "Unable to unwrap agency DEK");
  }
}

// ─── Per-request cache ─────────────────────────────────────────────────────

/**
 * A per-request cache so multiple `getDekForAgency` calls in the
 * same request cost one DB round trip. The cache is created at the
 * API route entry point and discarded after.
 */
export type DekCache = {
  get(agencyId: string): Promise<Buffer | null>;
  prime(agencyId: string, dek: Buffer): void;
};

export function createDekCache(db: Db): DekCache {
  const map = new Map<string, Buffer>();
  return {
    get: async (agencyId: string) => {
      const cached = map.get(agencyId);
      if (cached) return cached;
      const rows = await db
        .select({
          ciphertext: agencySocialDek.dekCiphertext,
          iv: agencySocialDek.dekIv,
          tag: agencySocialDek.dekTag,
          keyVersion: agencySocialDek.dekKeyVersion,
        })
        .from(agencySocialDek)
        .where(eq(agencySocialDek.agencyId, agencyId))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      const kek = getKekOrThrow();
      const dek = unwrapDek(
        {
          ciphertext: row.ciphertext,
          iv: row.iv,
          tag: row.tag,
          keyVersion: 1 as const,
        },
        kek,
      );
      map.set(agencyId, dek);
      return dek;
    },
    prime: (agencyId: string, dek: Buffer) => {
      map.set(agencyId, dek);
    },
  };
}

// ─── Service: enable / disable / rotate ────────────────────────────────────

/**
 * Enable social analytics for an agency. Generates a fresh 32-byte
 * DEK, wraps it with the platform KEK, and stores the envelope. The
 * plaintext DEK (base64-encoded) is returned in the result so the
 * caller can show it to the agency admin ONCE. After this call, the
 * DEK is only ever available in memory (via `getDekForAgency`) or in
 * the response of a future `rotateAgencyDek` call.
 *
 * Throws:
 *   - `MissingKekError` if the platform KEK is missing in production.
 *   - `DekAlreadyEnabledError` if the agency is already enabled.
 */
export async function enableAgencyDek(
  db: Db,
  args: { agencyId: string; actorId: string },
): Promise<EnableResult> {
  const kek = getKekOrThrow();
  const dek = randomBytes(DEK_BYTES);
  const wrapped = wrapDek(dek, kek);

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(agencySocialDek)
      .values({
        agencyId: args.agencyId,
        dekCiphertext: wrapped.ciphertext,
        dekIv: wrapped.iv,
        dekTag: wrapped.tag,
        dekKeyVersion: wrapped.keyVersion,
        enabledBy: args.actorId,
      })
      .onConflictDoNothing({ target: agencySocialDek.agencyId })
      .returning({ agencyId: agencySocialDek.agencyId });
    if (inserted.length === 0) {
      throw new DekAlreadyEnabledError(args.agencyId);
    }
    return {
      dekRecoveryKey: dek.toString("base64"),
      dekKeyVersion: wrapped.keyVersion,
    };
  });
}

/**
 * Disable social analytics for an agency. In one transaction:
 *
 *   1. Mark every `social_connection` for workspaces in this agency
 *      as `revoked` (preserves audit trail).
 *   2. Detach every `social_channel` (clears provider linkage, sets
 *      `connection_status='disconnected'`, preserves external ID
 *      and metric history — matches the existing
 *      `revokeConnectionAndDetach` pattern).
 *   3. Delete the `agency_social_dek` row. After deletion, every
 *      sealed envelope becomes undecryptable on the next read; the
 *      surface is a 500 / `dek_unwrap_failed` and the agency must
 *      re-onboard to use social again.
 *
 * The function is idempotent: a second call on an already-disabled
 * agency succeeds without effect (no row to delete, no connections
 * to revoke).
 */
export async function disableAgencyDek(db: Db, args: { agencyId: string }): Promise<void> {
  await db.transaction(async (tx) => {
    // Lock the DEK row (if it exists) so a concurrent rotate
    // cannot race the disable. FOR UPDATE skips rows that do not
    // exist, so a disabled agency does not block.
    const [dekRow] = await tx
      .select({ agencyId: agencySocialDek.agencyId })
      .from(agencySocialDek)
      .where(eq(agencySocialDek.agencyId, args.agencyId))
      .for("update")
      .limit(1);
    if (!dekRow) return;

    // Revoke every connection for workspaces in this agency.
    const workspaceIds = await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.agencyId, args.agencyId));
    const wsIds = workspaceIds.map((w) => w.id);
    if (wsIds.length > 0) {
      const nowDate = new Date();
      await tx
        .update(socialConnections)
        .set({ status: "revoked", revokedAt: nowDate, updatedAt: nowDate })
        .where(inArray(socialConnections.workspaceId, wsIds));
      await tx
        .update(socialChannels)
        .set({
          socialConnectionId: null,
          connectionStatus: "disconnected",
          syncLeaseUntil: null,
          nextSyncAt: null,
          lastSyncErrorAt: null,
          lastSyncErrorCode: null,
          syncFailureCount: 0,
          updatedAt: nowDate,
        })
        .where(inArray(socialChannels.workspaceId, wsIds));
    }

    await tx.delete(agencySocialDek).where(eq(agencySocialDek.agencyId, args.agencyId));
  });
}

/**
 * Rotate the agency DEK. In one transaction:
 *
 *   1. Lock the `agency_social_dek` row and unwrap the old DEK.
 *   2. For every `social_connection` for the agency's workspaces,
 *      open the existing envelope with the old DEK and re-seal it
 *      with the new DEK.
 *   3. Generate a new DEK, wrap it with the KEK, replace the row.
 *
 * The new DEK plaintext is returned ONCE (same surface as
 * `enableAgencyDek`). Concurrent cron ticks for the agency block
 * on the row lock; the total lock duration is bounded by
 * connection count.
 *
 * Throws:
 *   - `MissingKekError` if the platform KEK is missing in production.
 *   - `DekNotEnabledError` if the agency has not enabled social.
 *   - `DekRotationError` if the existing DEK envelope is corrupted.
 */
export async function rotateAgencyDek(
  db: Db,
  args: { agencyId: string; actorId: string; reason: DekRotationReason },
): Promise<RotateResult> {
  const kek = getKekOrThrow();
  const newDek = randomBytes(DEK_BYTES);
  const wrapped = wrapDek(newDek, kek);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        ciphertext: agencySocialDek.dekCiphertext,
        iv: agencySocialDek.dekIv,
        tag: agencySocialDek.dekTag,
        enabledBy: agencySocialDek.enabledBy,
      })
      .from(agencySocialDek)
      .where(eq(agencySocialDek.agencyId, args.agencyId))
      .for("update")
      .limit(1);
    if (!row) {
      throw new DekNotEnabledError(args.agencyId);
    }
    const oldDek = unwrapDek(
      { ciphertext: row.ciphertext, iv: row.iv, tag: row.tag, keyVersion: 1 as const },
      kek,
    );

    // Re-seal every connection for the agency's workspaces.
    const workspaceIds = await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.agencyId, args.agencyId));
    const wsIds = workspaceIds.map((w) => w.id);
    if (wsIds.length > 0) {
      const conns = await tx
        .select({
          id: socialConnections.id,
          ciphertext: socialConnections.credentialsCiphertext,
          iv: socialConnections.credentialsIv,
          tag: socialConnections.credentialsTag,
        })
        .from(socialConnections)
        .where(inArray(socialConnections.workspaceId, wsIds));
      const nowDate = new Date();
      for (const c of conns) {
        const plaintext = openCredentialsWithDek(
          { ciphertext: c.ciphertext, iv: c.iv, tag: c.tag, keyVersion: 1 as const },
          oldDek,
        );
        const resealed = sealCredentialsWithDek(plaintext, newDek);
        await tx
          .update(socialConnections)
          .set({
            credentialsCiphertext: resealed.ciphertext,
            credentialsIv: resealed.iv,
            credentialsTag: resealed.tag,
            credentialsKeyVersion: resealed.keyVersion,
            lastRefreshedAt: nowDate,
            updatedAt: nowDate,
          })
          .where(eq(socialConnections.id, c.id));
      }
    }

    await tx
      .update(agencySocialDek)
      .set({
        dekCiphertext: wrapped.ciphertext,
        dekIv: wrapped.iv,
        dekTag: wrapped.tag,
        dekKeyVersion: wrapped.keyVersion,
        lastRotatedAt: new Date(),
        lastRotatedBy: args.actorId,
        rotationReason: args.reason,
        updatedAt: new Date(),
      })
      .where(eq(agencySocialDek.agencyId, args.agencyId));

    return {
      dekRecoveryKey: newDek.toString("base64"),
      dekKeyVersion: wrapped.keyVersion,
    };
  });
}

/**
 * Fetch the DEK for an agency, using the provided per-request
 * cache. Returns the unwrapped DEK bytes. Throws
 * `DekNotEnabledError` if the agency has not enabled social.
 */
export async function getDekForAgency(db: Db, cache: DekCache, agencyId: string): Promise<Buffer> {
  const dek = await cache.get(agencyId);
  if (!dek) {
    throw new DekNotEnabledError(agencyId);
  }
  return dek;
}

/**
 * Resolve the agency for a workspace and return its DEK. Convenience
 * wrapper for the repository, which already has a `workspaceId`.
 */
export async function getDekForWorkspace(
  db: Db,
  cache: DekCache,
  workspaceId: string,
): Promise<Buffer> {
  const rows = await db
    .select({ agencyId: workspaces.agencyId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }
  return getDekForAgency(db, cache, row.agencyId);
}

/**
 * Return the social status for an agency (enabled, key version,
 * last rotated). Pure read, no crypto.
 */
export async function getAgencySocialStatus(
  db: Db,
  agencyId: string,
): Promise<
  | { enabled: false }
  | {
      enabled: true;
      dekKeyVersion: number;
      enabledAt: Date;
      enabledBy: string;
      lastRotatedAt: Date | null;
      rotationReason: string | null;
    }
> {
  const [row] = await db
    .select({
      dekKeyVersion: agencySocialDek.dekKeyVersion,
      enabledAt: agencySocialDek.enabledAt,
      enabledBy: agencySocialDek.enabledBy,
      lastRotatedAt: agencySocialDek.lastRotatedAt,
      rotationReason: agencySocialDek.rotationReason,
    })
    .from(agencySocialDek)
    .where(eq(agencySocialDek.agencyId, agencyId))
    .limit(1);
  if (!row) return { enabled: false };
  return {
    enabled: true,
    dekKeyVersion: row.dekKeyVersion,
    enabledAt: row.enabledAt,
    enabledBy: row.enabledBy,
    lastRotatedAt: row.lastRotatedAt,
    rotationReason: row.rotationReason,
  };
}

// ─── KEK rotation helper (for the script) ─────────────────────────────────

/**
 * Re-wrap every `agency_social_dek` row from `oldKek` to `newKek`.
 * Used by `scripts/rotate-social-kek.ts`. Returns counts for the
 * script's summary line.
 *
 * Throws `DekRotationError` on any malformed row so the script
 * can stop and report. The transaction is per-agency so a single
 * bad row does not roll back successful re-wraps.
 */
export async function rewrapAllDeksForKekRotation(
  db: Db,
  args: { oldKek: Buffer; newKek: Buffer; dryRun?: boolean },
): Promise<{ ok: number; failed: number; total: number }> {
  if (args.oldKek.length !== KEK_BYTES) {
    throw new DekRotationError("malformed", "oldKek must be 32 bytes");
  }
  if (args.newKek.length !== KEK_BYTES) {
    throw new DekRotationError("malformed", "newKek must be 32 bytes");
  }
  const rows = await db
    .select({
      agencyId: agencySocialDek.agencyId,
      ciphertext: agencySocialDek.dekCiphertext,
      iv: agencySocialDek.dekIv,
      tag: agencySocialDek.dekTag,
    })
    .from(agencySocialDek);
  let ok = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const dek = unwrapDek(
        { ciphertext: row.ciphertext, iv: row.iv, tag: row.tag, keyVersion: 1 as const },
        args.oldKek,
      );
      const wrapped = wrapDek(dek, args.newKek);
      if (!args.dryRun) {
        await db.transaction(async (tx) => {
          await tx
            .update(agencySocialDek)
            .set({
              dekCiphertext: wrapped.ciphertext,
              dekIv: wrapped.iv,
              dekTag: wrapped.tag,
              dekKeyVersion: wrapped.keyVersion,
              updatedAt: new Date(),
            })
            .where(eq(agencySocialDek.agencyId, row.agencyId));
        });
      }
      ok += 1;
    } catch {
      failed += 1;
    }
  }
  return { ok, failed, total: rows.length };
}

// Silences the unused-import linter for `and` / `sql`; they are
// re-exported for callers that want to compose with the same query
// fragments. (The `and` and `sql` imports are used by tests in
// tests/integration/.)
void and;
void sql;
