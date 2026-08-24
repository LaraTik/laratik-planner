import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCM,
  type DecipherGCM,
} from "node:crypto";

/**
 * M4 — provider credential envelope.
 *
 * The M4 plan calls for AES-256-GCM with a versioned AAD so that a
 * single leaked ciphertext cannot be replayed against a future key
 * rotation. The 32-byte key is read from `SOCIAL_TOKEN_ENCRYPTION_KEY`
 * (base64); any other length is rejected up-front so a misconfigured
 * env var fails closed rather than degrading to a weaker key.
 *
 * The AAD `laratik-planner:social-credentials:v1` is bound to the
 * ciphertext. A row sealed with key version 1 will refuse to open
 * against a future `v2` AAD, and a row sealed with v1 of the AAD
 * cannot be replayed against a v2 key set.
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

/**
 * Decode and validate the base64 encryption key. The key must be
 * exactly 32 bytes (AES-256). Anything else is a configuration error,
 * not a runtime failure, so we throw immediately.
 */
function decodeKey(base64Key: string): Buffer {
  if (typeof base64Key !== "string" || base64Key.length === 0) {
    throw new SocialCredentialError(
      "SOCIAL_TOKEN_ENCRYPTION_KEY is not set (expected 32 base64 bytes)",
    );
  }
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== KEY_BYTES) {
    throw new SocialCredentialError(
      `SOCIAL_TOKEN_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${key.length})`,
    );
  }
  return key;
}

/**
 * Encrypt a credentials payload. Returns the sealed envelope. The IV
 * is fresh for every call (the unit test asserts that two seals of
 * the same payload differ in IV, ciphertext, and tag).
 */
export function sealCredentials(payload: SocialCredentials, base64Key: string): SealedCredentials {
  const key = decodeKey(base64Key);
  const iv = randomBytes(IV_BYTES);
  const cipher: CipherGCM = createCipheriv("aes-256-gcm", key, iv);
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
 * Decrypt a sealed envelope. Throws `SocialCredentialError` (with a
 * sanitized message that contains no key material, no IV, and no
 * ciphertext) when the envelope has been tampered with, when the AAD
 * does not match, or when the key does not match.
 */
export function openCredentials(sealed: SealedCredentials, base64Key: string): SocialCredentials {
  const key = decodeKey(base64Key);
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
  const decipher: DecipherGCM = createDecipheriv("aes-256-gcm", key, iv);
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
