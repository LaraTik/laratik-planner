import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCM,
  type DecipherGCM,
} from "node:crypto";

/**
 * M4 — provider credential envelope (DEK-in-hand API).
 *
 * The M4 plan calls for AES-256-GCM with a versioned AAD so that a
 * single leaked ciphertext cannot be replayed against a future key
 * rotation. The 32-byte key is the **agency DEK** (see
 * `src/lib/social/key-management.ts`), NOT a platform env var. The
 * caller is responsible for resolving the DEK via
 * `getDekForAgency` or `getDekForWorkspace`.
 *
 * The AAD `laratik-planner:social-credentials:v1` is bound to the
 * ciphertext. A row sealed with key version 1 will refuse to open
 * against a future `v2` AAD, and a row sealed with v1 of the AAD
 * cannot be replayed against a v2 key set.
 *
 * The legacy `sealCredentials(payload, base64Key)` /
 * `openCredentials(sealed, base64Key)` helpers have been removed in
 * M4.5. All callers now use the DEK-in-hand API. Tests, the
 * repository, and the sync worker were updated in the same commit.
 *
 * Tokens never appear in:
 *
 *   - the sealed ciphertext (proven by the unit test)
 *   - the audit log (we only ever log `keyVersion`, never the IV)
 *   - the database JSON columns (only ciphertext + iv + tag + keyVersion
 *     are persisted)
 *   - the social_channel.notes column (the application never reads or
 *     writes `notes` from any M4 code path)
 */

export type SocialCredentials = {
  accessToken: string;
  refreshToken?: string;
  /**
   * Per-profile access tokens for providers that hand out a separate
   * access token per managed resource (e.g. Meta's per-Page tokens).
   * Keys are provider-specific external IDs. Values are never logged.
   */
  profileAccessTokens?: Record<string, string>;
};

export type SealedCredentials = {
  ciphertext: string;
  iv: string;
  tag: string;
  keyVersion: 1;
};

const AAD = Buffer.from("laratik-planner:social-credentials:v1", "utf8");
const KEY_VERSION = 1 as const;
const KEY_BYTES = 32;
const IV_BYTES = 12;

export class SocialCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SocialCredentialError";
  }
}

function validateDek(dek: Buffer): void {
  if (!Buffer.isBuffer(dek) || dek.length !== KEY_BYTES) {
    throw new SocialCredentialError(
      `DEK must be a ${KEY_BYTES}-byte Buffer (got ${dek?.length ?? "n/a"})`,
    );
  }
}

/**
 * Encrypt a credentials payload with the agency's DEK. The IV is
 * fresh for every call (the unit test asserts that two seals of the
 * same payload differ in IV, ciphertext, and tag). Returns the
 * sealed envelope in the existing column-friendly string format.
 */
export function sealCredentialsWithDek(payload: SocialCredentials, dek: Buffer): SealedCredentials {
  validateDek(dek);
  const iv = randomBytes(IV_BYTES);
  const cipher: CipherGCM = createCipheriv("aes-256-gcm", dek, iv);
  cipher.setAAD(AAD);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    keyVersion: KEY_VERSION,
  };
}

/**
 * Decrypt a sealed envelope with the agency's DEK. Throws
 * `SocialCredentialError` (with a sanitized message that contains
 * no key material, no IV, and no ciphertext) when the envelope has
 * been tampered with, when the AAD does not match, or when the key
 * does not match.
 */
export function openCredentialsWithDek(sealed: SealedCredentials, dek: Buffer): SocialCredentials {
  validateDek(dek);
  if (sealed.keyVersion !== KEY_VERSION) {
    throw new SocialCredentialError(
      `Unsupported social credential envelope version (got ${sealed.keyVersion}, expected ${KEY_VERSION})`,
    );
  }
  let ciphertext: Buffer;
  let iv: Buffer;
  let tag: Buffer;
  try {
    ciphertext = Buffer.from(sealed.ciphertext, "base64");
    iv = Buffer.from(sealed.iv, "base64");
    tag = Buffer.from(sealed.tag, "base64");
  } catch {
    throw new SocialCredentialError("Unable to decrypt social credentials");
  }
  if (iv.length !== IV_BYTES) {
    throw new SocialCredentialError("Unable to decrypt social credentials");
  }
  const decipher: DecipherGCM = createDecipheriv("aes-256-gcm", dek, iv);
  decipher.setAAD(AAD);
  decipher.setAuthTag(tag);
  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    // GCM authentication failure — do not leak the underlying reason.
    throw new SocialCredentialError("Unable to decrypt social credentials");
  }
  try {
    return JSON.parse(plaintext.toString("utf8")) as SocialCredentials;
  } catch {
    throw new SocialCredentialError("Unable to decrypt social credentials");
  }
}
