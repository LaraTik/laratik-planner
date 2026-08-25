import "server-only";
import { and, eq } from "drizzle-orm";
import { agencySocialProviderConfig } from "@/lib/db/schema";
import {
  createDekCache,
  DekNotEnabledError,
  getDekForAgency,
  isKekAvailable,
  MissingKekError,
  type Db,
} from "./key-management";
import {
  openAppSecretWithDek,
  ProviderConfigCryptoError,
  sealAppSecretWithDek,
} from "./app-config-crypto";

/**
 * M4.6 — per-agency social provider config service.
 *
 * Replaces the platform-wide env reads
 * (`META_APP_ID` / `META_APP_SECRET` / `META_LOGIN_CONFIG_ID` /
 * `SOCIAL_TOKEN_ENCRYPTION_KEY`) with per-agency database rows.
 * The hard cutover means: if no row exists for the agency's
 * provider, the call sites in the connect / callback routes
 * and the channels page return a 409 with a `setupUrl` pointer
 * at `/app/agency-settings/social/providers`. There is no env
 * fallback by design.
 *
 * The app secret is sealed with the same per-agency DEK the
 * social-connection credentials use, but with a distinct AAD
 * (`laratik-planner:social-app-config:v1`). See
 * `src/lib/social/app-config-crypto.ts` for the envelope shape.
 *
 * Failure model (matches the existing run path):
 *   - `MissingKekError`        — platform KEK not set. Routes translate
 *                                to 503 `platform_kek_missing`.
 *   - `DekNotEnabledError`     — agency has not enabled social. Routes
 *                                translate to 404 `social_not_enabled`.
 *   - `ProviderConfigCryptoError` — wrapped secret is corrupted (DEK
 *                                rotated, ciphertext tampered, or
 *                                AAD mismatch). Routes translate to
 *                                500 `provider_config_decrypt_failed`.
 *   - `{ ok: false, errorCode: "not_configured" }` — no row for this
 *                                (agency, provider). Routes translate
 *                                to 409 `not_configured` with the
 *                                `setupUrl`.
 *
 * Threading:
 *   - `getAgencyProviderConfig` is read-only and is safe to call
 *     concurrently. The DEK lookup is cached per request via
 *     `getDekForAgency` (the existing pattern in key-management.ts).
 *   - `setAgencyProviderConfig` uses `ON CONFLICT (agency_id, provider)
 *     DO UPDATE` so a re-paste is a single round trip. The
 *     `updated_at` column is bumped; `configured_by` is overwritten
 *     to the latest admin (audit trail: who last rotated the secret).
 *   - `removeAgencyProviderConfig` is a hard delete. Existing social
 *     connections for the agency are NOT affected — the run path
 *     already has the connection's own credentials sealed at
 *     connect time, so removing the provider config does not
 *     disconnect already-connected channels. The agency admin
 *     explicitly does "Disconnect" per-channel for that.
 */

export type SocialProvider = "meta" | "tiktok";

export type ResolvedProviderConfig = {
  provider: SocialProvider;
  appId: string;
  appSecret: string;
  loginConfigId: string | null;
  graphApiVersion: string | null;
  enabled: boolean;
  configuredBy: string;
  lastTestedAt: Date | null;
  lastTestedOk: boolean | null;
  lastTestErrorCode: string | null;
  lastTestErrorAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SetProviderConfigInput = {
  agencyId: string;
  provider: SocialProvider;
  appId: string;
  appSecret: string;
  loginConfigId: string | null;
  graphApiVersion: string | null;
  enabled: boolean;
  actorId: string;
};

export type NotConfiguredError = { ok: false; errorCode: "not_configured" };

/**
 * Read-only lookup. Returns the resolved (decrypted) config or
 * `{ ok: false, errorCode: "not_configured" }` when the agency
 * has not configured this provider yet. Throws
 * `MissingKekError` / `DekNotEnabledError` /
 * `ProviderConfigCryptoError` for the platform-level failure
 * modes — callers map these to the appropriate HTTP status.
 */
export async function getAgencyProviderConfig(
  db: Db,
  agencyId: string,
  provider: SocialProvider,
): Promise<ResolvedProviderConfig | NotConfiguredError> {
  const [row] = await db
    .select()
    .from(agencySocialProviderConfig)
    .where(
      and(
        eq(agencySocialProviderConfig.agencyId, agencyId),
        eq(agencySocialProviderConfig.provider, provider),
      ),
    )
    .limit(1);
  if (!row) {
    return { ok: false, errorCode: "not_configured" };
  }
  const cache = createDekCache(db);
  const dek = await getDekForAgency(db, cache, agencyId);
  const appSecret = openAppSecretWithDek(
    {
      ciphertext: row.appSecretCiphertext,
      iv: row.appSecretIv,
      tag: row.appSecretTag,
    },
    dek,
  );
  return {
    provider: provider,
    appId: row.appId,
    appSecret,
    loginConfigId: row.loginConfigId,
    graphApiVersion: row.graphApiVersion,
    enabled: row.enabled,
    configuredBy: row.configuredBy,
    lastTestedAt: row.lastTestedAt,
    lastTestedOk: row.lastTestedOk,
    lastTestErrorCode: row.lastTestErrorCode,
    lastTestErrorAt: row.lastTestErrorAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Convenience: `true` if a row exists for (agency, provider).
 * Does NOT decrypt. Used by the channels page to gate the
 * "Connect Meta" card on whether the agency has config, without
 * paying the decrypt cost on every page load.
 */
export async function hasAgencyProviderConfig(
  db: Db,
  agencyId: string,
  provider: SocialProvider,
): Promise<boolean> {
  const [row] = await db
    .select({ id: agencySocialProviderConfig.id })
    .from(agencySocialProviderConfig)
    .where(
      and(
        eq(agencySocialProviderConfig.agencyId, agencyId),
        eq(agencySocialProviderConfig.provider, provider),
        eq(agencySocialProviderConfig.enabled, true),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * Upsert. The `ON CONFLICT` clause targets the unique
 * `(agency_id, provider)` index. Returns the row id of the
 * saved config so the UI can navigate to a detail view if we
 * add one. Rejects when the platform KEK is missing — the
 * operator must set `SOCIAL_TOKEN_ENCRYPTION_KEY` first.
 */
export async function setAgencyProviderConfig(
  db: Db,
  input: SetProviderConfigInput,
): Promise<{ id: string }> {
  if (!isKekAvailable()) {
    throw new MissingKekError();
  }
  const cache = createDekCache(db);
  const dek = await getDekForAgency(db, cache, input.agencyId);
  const sealed = sealAppSecretWithDek(input.appSecret, dek);
  const [row] = await db
    .insert(agencySocialProviderConfig)
    .values({
      agencyId: input.agencyId,
      provider: input.provider,
      appId: input.appId,
      appSecretCiphertext: sealed.ciphertext,
      appSecretIv: sealed.iv,
      appSecretTag: sealed.tag,
      appSecretKeyVersion: 1,
      loginConfigId: input.loginConfigId,
      graphApiVersion: input.graphApiVersion,
      enabled: input.enabled,
      configuredBy: input.actorId,
    })
    .onConflictDoUpdate({
      target: [agencySocialProviderConfig.agencyId, agencySocialProviderConfig.provider],
      set: {
        appId: input.appId,
        appSecretCiphertext: sealed.ciphertext,
        appSecretIv: sealed.iv,
        appSecretTag: sealed.tag,
        appSecretKeyVersion: 1,
        loginConfigId: input.loginConfigId,
        graphApiVersion: input.graphApiVersion,
        enabled: input.enabled,
        configuredBy: input.actorId,
        // Audit trail: clear the last-tested fingerprint on every
        // secret rotation. The admin should re-test before relying
        // on the row for the Connect Meta flow.
        lastTestedAt: null,
        lastTestedOk: null,
        lastTestErrorCode: null,
        lastTestErrorAt: null,
        updatedAt: new Date(),
      },
    })
    .returning({ id: agencySocialProviderConfig.id });
  if (!row) {
    throw new Error("Failed to save provider config (no row returned from upsert)");
  }
  return { id: row.id };
}

/**
 * Hard delete. Returns `true` when a row was removed, `false`
 * when no row existed. Existing social connections are NOT
 * cascaded — the connection row has its own credentials sealed
 * at connect time, so removing the provider config does not
 * disconnect already-connected channels.
 */
export async function removeAgencyProviderConfig(
  db: Db,
  agencyId: string,
  provider: SocialProvider,
): Promise<boolean> {
  const result = await db
    .delete(agencySocialProviderConfig)
    .where(
      and(
        eq(agencySocialProviderConfig.agencyId, agencyId),
        eq(agencySocialProviderConfig.provider, provider),
      ),
    )
    .returning({ id: agencySocialProviderConfig.id });
  return result.length > 0;
}

/**
 * Update the last-tested fingerprint. Called by
 * `/api/social/providers/test` after a successful or failed
 * handshake so the agency-settings UI can show "Verified X
 * minutes ago" / "Last test failed: rate_limited" without
 * re-running the test on every page load.
 */
export async function recordProviderTestResult(
  db: Db,
  agencyId: string,
  provider: SocialProvider,
  result: { ok: boolean; errorCode: string | null },
): Promise<void> {
  await db
    .update(agencySocialProviderConfig)
    .set({
      lastTestedAt: new Date(),
      lastTestedOk: result.ok,
      lastTestErrorCode: result.ok ? null : result.errorCode,
      lastTestErrorAt: result.ok ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(agencySocialProviderConfig.agencyId, agencyId),
        eq(agencySocialProviderConfig.provider, provider),
      ),
    );
}

// Re-export for the route layer.
export { ProviderConfigCryptoError, DekNotEnabledError, MissingKekError };
