import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCM,
  type DecipherGCM,
} from "node:crypto";

/**
 * M4.6 — provider app-secret envelope (DEK-in-hand API).
 *
 * Mirror of `src/lib/social/crypto.ts` but for the per-agency
 * provider app secret (Meta app secret / TikTok client secret)
 * instead of the per-connection OAuth tokens. The DEK is the
 * same per-agency DEK that already exists in
 * `agency_social_dek`; only the AAD changes so a future rotation
 * of one envelope does not drag the other along.
 *
 * AAD: `laratik-planner:social-app-config:v1`
 *   (vs. `laratik-planner:social-credentials:v1` for OAuth tokens,
 *    and `laratik-planner:social-dek:v1` for the wrapped DEK
 *    itself).
 *
 * Key version is a single field — there is no `keyVersion` on the
 * sealed envelope because the seal IS versioned: the platform
 * always uses the current DEK; an unwrap failure means the DEK
 * was rotated away. The application surfaces a clear
 * `ProviderConfigDecryptError` rather than introducing a
 * `keyVersion` column we have to keep in sync.
 *
 * The plaintext is the raw app secret (UTF-8 string). It is
 * never logged, never returned in an error message, never
 * rendered in the UI. The agency admin pastes the secret
 * exactly once; the application re-seals on every edit.
 */

export type SealedAppSecret = {
  ciphertext: string;
  iv: string;
  tag: string;
};

const AAD = Buffer.from("laratik-planner:social-app-config:v1", "utf8");
const KEY_BYTES = 32;
const IV_BYTES = 12;

export class ProviderConfigCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigCryptoError";
  }
}

function validateDek(dek: Buffer): void {
  if (!Buffer.isBuffer(dek) || dek.length !== KEY_BYTES) {
    throw new ProviderConfigCryptoError(
      `DEK must be a ${KEY_BYTES}-byte Buffer (got ${dek?.length ?? "n/a"})`,
    );
  }
}

/**
 * Encrypt an app secret (plaintext UTF-8) with the agency's DEK.
 * The IV is fresh for every call. Returns the sealed envelope in
 * the column-friendly string format (base64 of bytes).
 */
export function sealAppSecretWithDek(plaintext: string, dek: Buffer): SealedAppSecret {
  validateDek(dek);
  const iv = randomBytes(IV_BYTES);
  const cipher: CipherGCM = createCipheriv("aes-256-gcm", dek, iv);
  cipher.setAAD(AAD);
  const buf = Buffer.from(plaintext, "utf8");
  const ciphertext = Buffer.concat([cipher.update(buf), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

/**
 * Decrypt a sealed app secret with the agency's DEK. Throws
 * `ProviderConfigCryptoError` (sanitized message) on tampering,
 * wrong AAD, or wrong key. The error message intentionally
 * contains no key material, no IV, and no ciphertext.
 */
export function openAppSecretWithDek(sealed: SealedAppSecret, dek: Buffer): string {
  validateDek(dek);
  let ciphertext: Buffer;
  let iv: Buffer;
  let tag: Buffer;
  try {
    ciphertext = Buffer.from(sealed.ciphertext, "base64");
    iv = Buffer.from(sealed.iv, "base64");
    tag = Buffer.from(sealed.tag, "base64");
  } catch {
    throw new ProviderConfigCryptoError("Unable to decrypt provider app secret");
  }
  if (iv.length !== IV_BYTES) {
    throw new ProviderConfigCryptoError("Unable to decrypt provider app secret");
  }
  const decipher: DecipherGCM = createDecipheriv("aes-256-gcm", dek, iv);
  decipher.setAAD(AAD);
  decipher.setAuthTag(tag);
  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new ProviderConfigCryptoError("Unable to decrypt provider app secret");
  }
  return plaintext.toString("utf8");
}
