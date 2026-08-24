import "server-only";
import { revalidatePath } from "next/cache";
import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { aiFeatureSettings, aiProviderSecret, securityAuditEvents } from "@/lib/db/schema";
import { isAgencyAdmin, requirePolicy, type Actor } from "@/lib/auth/policy";
import {
  decryptForAgency,
  encryptForAgency,
  isValidApiKeyShape,
  MissingEncryptionKeyError,
} from "@/lib/security/secrets";

/**
 * Managed-secret service for the AI provider key (M3.4 — AI in-DB secret).
 *
 * The plaintext key is never stored. `setManagedAiSecret` encrypts
 * the input via `encryptForAgency`, writes the ciphertext to
 * `ai_provider_secret`, upserts the agency's `ai_feature_setting`
 * row with `key_source = 'managed_secret'`, `masked_key_suffix =
 * lastFour`, and `enabled = true` (the user is turning AI on by
 * providing a key, so the master switch flips on). `clearManagedAiSecret`
 * deletes the ciphertext row and reverts the feature setting to
 * the environment key — but does **not** change `enabled`
 * (the user might still want to gate the master switch on the
 * env key, or might want to turn it off manually).
 *
 * `loadManagedAiSecret(agencyId)` is the read path used by
 * `/api/ai/generate` and the "Test connection" action. It is the
 * only function that decrypts.
 *
 * Authorization: every mutation requires `isAgencyAdmin(actor, agencyId)`.
 * The audit row goes to `security_audit_events` with the action verb
 * and a metadata jsonb that carries the `lastFour` and the actor.
 * The plaintext key is never included in the audit row, in logs,
 * or in any error path.
 *
 * Failure model:
 *   - The Zod schema rejects malformed input before encryption.
 *   - The encryption helper throws `MissingEncryptionKeyError`
 *     when the env key is missing in production; the service
 *     re-throws as a structured error.
 *   - The DB writes happen inside a single transaction so a
 *     partially-applied state is impossible.
 */

export const SetManagedAiSecretSchema = z.object({
  apiKey: z
    .string()
    .min(12, "API key looks too short")
    .max(256, "API key looks too long")
    .refine(isValidApiKeyShape, "API key must start with 'sk-' and contain only base64url chars"),
});
export type SetManagedAiSecretInput = z.infer<typeof SetManagedAiSecretSchema>;

export const ClearManagedAiSecretSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type ClearManagedAiSecretInput = z.infer<typeof ClearManagedAiSecretSchema>;

export type ManagedSecret = { apiKey: string; lastFour: string; keyVersion: number };

export class ManagedSecretError extends Error {
  public readonly code:
    | "managed_secret.invalid-input"
    | "managed_secret.not-platform-admin"
    | "managed_secret.missing-key"
    | "managed_secret.encryption-failed";
  constructor(
    code: ManagedSecretError["code"],
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ManagedSecretError";
    this.code = code;
  }
}

/**
 * Encrypt and store the agency's AI provider key. The agency's
 * `ai_feature_setting` row is upserted with `key_source =
 * 'managed_secret'` and `enabled = true` so the next
 * `/api/ai/generate` call uses the new key without any additional
 * UI step.
 *
 * Idempotent: re-running on an agency that already has a managed
 * secret overwrites the ciphertext with a fresh encryption (and
 * a new IV) and updates `lastFour` accordingly.
 */
export async function setManagedAiSecret(
  actor: Actor,
  agencyId: string,
  raw: SetManagedAiSecretInput,
): Promise<{ lastFour: string }> {
  await requirePolicy(isAgencyAdmin(actor, agencyId), "set_managed_ai_secret");
  const input = SetManagedAiSecretSchema.parse(raw);

  let encrypted: { ciphertext: Buffer; keyVersion: number; lastFour: string };
  try {
    encrypted = encryptForAgency(input.apiKey);
  } catch (e) {
    if (e instanceof MissingEncryptionKeyError) {
      throw new ManagedSecretError("managed_secret.missing-key", e.message, { agencyId });
    }
    throw new ManagedSecretError(
      "managed_secret.encryption-failed",
      e instanceof Error ? e.message : "Could not encrypt the API key.",
    );
  }

  await db.transaction(async (tx) => {
    // Upsert the ciphertext row.
    const [existing] = await tx
      .select({ agencyId: aiProviderSecret.agencyId })
      .from(aiProviderSecret)
      .where(eq(aiProviderSecret.agencyId, agencyId))
      .limit(1);
    if (existing) {
      await tx
        .update(aiProviderSecret)
        .set({
          ciphertext: encrypted.ciphertext,
          keyVersion: encrypted.keyVersion,
          lastFour: encrypted.lastFour,
          rotatedByUserId: actor.id,
          updatedAt: new Date(),
        })
        .where(eq(aiProviderSecret.agencyId, agencyId));
    } else {
      await tx.insert(aiProviderSecret).values({
        agencyId,
        ciphertext: encrypted.ciphertext,
        keyVersion: encrypted.keyVersion,
        lastFour: encrypted.lastFour,
        rotatedByUserId: actor.id,
      });
    }

    // Upsert the feature settings row. `enabled = true` because the
    // user is turning AI on by providing a key. `keySource` and
    // `maskedKeySuffix` mirror the secret for fast UI reads.
    const [featureRow] = await tx
      .select({ agencyId: aiFeatureSettings.agencyId })
      .from(aiFeatureSettings)
      .where(eq(aiFeatureSettings.agencyId, agencyId))
      .limit(1);
    if (featureRow) {
      await tx
        .update(aiFeatureSettings)
        .set({
          keySource: "managed_secret",
          maskedKeySuffix: encrypted.lastFour,
          enabled: true,
          updatedBy: actor.id,
          updatedAt: new Date(),
        })
        .where(eq(aiFeatureSettings.agencyId, agencyId));
    } else {
      await tx.insert(aiFeatureSettings).values({
        agencyId,
        enabled: true,
        model: "MiniMax-M3",
        enabledCapabilities: [],
        keySource: "managed_secret",
        maskedKeySuffix: encrypted.lastFour,
        updatedBy: actor.id,
      });
    }

    await tx.insert(securityAuditEvents).values({
      actorId: actor.id,
      action: "ai_secret.set",
      targetType: "agency",
      targetId: agencyId,
      outcome: "success",
      metadata: {
        lastFour: encrypted.lastFour,
        keyVersion: encrypted.keyVersion,
      },
    });
  });

  revalidatePath("/app/agency-settings/ai");
  revalidatePath(`/app/w/[slug]/ai-settings`, "page");
  return { lastFour: encrypted.lastFour };
}

/**
 * Remove the agency's managed secret. Reverts `key_source` to
 * `'environment'` and clears `masked_key_suffix`. **Does not**
 * change `enabled` — the user may still want the master switch
 * on, gated by the env key. They can turn it off manually.
 */
export async function clearManagedAiSecret(
  actor: Actor,
  agencyId: string,
  raw: ClearManagedAiSecretInput,
): Promise<void> {
  await requirePolicy(isAgencyAdmin(actor, agencyId), "clear_managed_ai_secret");
  const input = ClearManagedAiSecretSchema.parse(raw);

  await db.transaction(async (tx) => {
    await tx.delete(aiProviderSecret).where(eq(aiProviderSecret.agencyId, agencyId));
    await tx
      .update(aiFeatureSettings)
      .set({
        keySource: "environment",
        maskedKeySuffix: null,
        updatedBy: actor.id,
        updatedAt: new Date(),
      })
      .where(eq(aiFeatureSettings.agencyId, agencyId));
    await tx.insert(securityAuditEvents).values({
      actorId: actor.id,
      action: "ai_secret.clear",
      targetType: "agency",
      targetId: agencyId,
      outcome: "success",
      metadata: { reason: input.reason },
    });
  });

  revalidatePath("/app/agency-settings/ai");
  revalidatePath(`/app/w/[slug]/ai-settings`, "page");
}

/**
 * Decrypt the managed secret for the given agency. Returns
 * `null` if no managed secret is configured. The `ManagedSecret`
 * shape is internal — the route layer should never expose the
 * `apiKey` to the client.
 *
 * Throws `MissingEncryptionKeyError` (re-thrown from the
 * encryption helper) when the env key is missing in production.
 * Callers should catch and map to 500.
 */
export async function loadManagedAiSecret(agencyId: string): Promise<ManagedSecret | null> {
  const [row] = await db
    .select({
      ciphertext: aiProviderSecret.ciphertext,
      keyVersion: aiProviderSecret.keyVersion,
      lastFour: aiProviderSecret.lastFour,
    })
    .from(aiProviderSecret)
    .where(eq(aiProviderSecret.agencyId, agencyId))
    .limit(1);
  if (!row) return null;
  if (!row.ciphertext) return null;
  // The bytea column may come back as a Buffer (drizzle-orm/node-postgres
  // returns bytea as Buffer). Be defensive against an unexpected
  // string value (which would be a misconfigured driver).
  const buf = Buffer.isBuffer(row.ciphertext)
    ? row.ciphertext
    : Buffer.from(row.ciphertext as unknown as string, "binary");
  const apiKey = decryptForAgency(buf, row.keyVersion);
  return { apiKey, lastFour: row.lastFour, keyVersion: row.keyVersion };
}

/**
 * Read the agency's `key_source` setting without decrypting.
 * Returns "managed_secret" | "environment" (or "missing" if the
 * agency has no `ai_feature_setting` row).
 */
export async function getManagedSecretStatus(
  agencyId: string,
): Promise<
  | { keySource: "managed_secret" | "environment"; lastFour: string | null; enabled: boolean }
  | { keySource: "missing" }
> {
  const [feature] = await db
    .select({
      keySource: aiFeatureSettings.keySource,
      maskedKeySuffix: aiFeatureSettings.maskedKeySuffix,
      enabled: aiFeatureSettings.enabled,
    })
    .from(aiFeatureSettings)
    .where(eq(aiFeatureSettings.agencyId, agencyId))
    .limit(1);
  if (!feature) return { keySource: "missing" };
  return {
    keySource: feature.keySource === "managed_secret" ? "managed_secret" : "environment",
    lastFour: feature.maskedKeySuffix ?? null,
    enabled: feature.enabled,
  };
}

/**
 * Detect whether a managed secret exists for the agency (without
 * decrypting). Used by the read path to choose between the
 * managed secret and the env key.
 */
export async function hasManagedAiSecret(agencyId: string): Promise<boolean> {
  const [row] = await db
    .select({ agencyId: aiProviderSecret.agencyId })
    .from(aiProviderSecret)
    .where(and(eq(aiProviderSecret.agencyId, agencyId), isNotNull(aiProviderSecret.ciphertext)))
    .limit(1);
  return !!row;
}

/**
 * Detect whether ANY agency on the platform has a managed secret
 * configured. The `/api/ai/generate` route uses this for its
 * 503 short-circuit ("no env key + no managed secret anywhere =
 * feature disabled") so the boot path is not affected by an
 * unused feature.
 */
export async function hasAnyManagedSecretConfigured(): Promise<boolean> {
  const [row] = await db
    .select({ agencyId: aiProviderSecret.agencyId })
    .from(aiProviderSecret)
    .where(isNotNull(aiProviderSecret.ciphertext))
    .limit(1);
  return !!row;
}
