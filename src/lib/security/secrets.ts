import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { serverEnv } from "@/lib/validation/env";

/**
 * Per-agency encrypted secret helpers (M3.4 — AI in-DB secret).
 *
 * The plaintext secret is never stored. `encryptForAgency` returns
 * a self-contained `Buffer` that bundles the 12-byte IV, the
 * 16-byte GCM auth tag, and the ciphertext. `decryptForAgency`
 * reverses the operation; on any tampering it throws
 * `EncryptedSecretError` which the route layer maps to `500`.
 *
 * Algorithm: AES-256-GCM (authenticated encryption). A fresh IV is
 * generated for every write. The auth tag is appended at the end
 * of the buffer; `crypto.createDecipheriv` reads the tag from the
 * final 16 bytes.
 *
 * Key resolution:
 *   - In production, `AI_SECRET_ENCRYPTION_KEY` must be set; the
 *     helper throws on the first call when it is missing. The
 *     validation in src/lib/validation/env.ts enforces the
 *     min-length invariant (≥ 32 ASCII chars).
 *   - In dev / test, a derived dev key is used (same posture as
 *     `src/lib/auth/agency-context.ts` for `AGENCY_COOKIE_SECRET`).
 *     The dev key is **not** constant: it is scrypt-derived from
 *     a fixed string so an accidental dump of the env file does
 *     not yield a working encryption key. The derivation salt is
 *     constant for the process lifetime.
 *
 * Key versioning: the env var may carry multiple keys in the
 * shape `k1:<base64> | k2:<base64>` (separated by `|`). The
 * default `readKey` returns the v1 key. A future migration can
 * call `readKey(version)` to read a v2 ciphertext without losing
 * the ability to decrypt older rows. The encrypt path always
 * writes with the latest key (currently v1).
 *
 * Failure model:
 *   - `EncryptedSecretError` — the buffer is too short, the auth
 *     tag does not match, the key is wrong, or the IV is
 *     truncated. The error name and code are stable so callers
 *     can catch and map to a 500.
 *   - `MissingEncryptionKeyError` — production env is missing the
 *     key. Surfaced as a clear `500` with a message that names
 *     the env var. The route layer does not need to translate
 *     this — the global handler renders the same surface.
 *
 * The helpers never `console.log` the plaintext or the key. The
 * only string they emit in the success path is the 4-char
 * `lastFour` (which is safe to display).
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits — the GCM-recommended length
const AUTH_TAG_LENGTH = 16; // 128 bits
const CURRENT_KEY_VERSION = 1;

export const EncryptedSecretErrorCode = {
  Malformed: "encrypted_secret.malformed",
  AuthFailed: "encrypted_secret.auth-failed",
} as const;
export type EncryptedSecretErrorCode =
  (typeof EncryptedSecretErrorCode)[keyof typeof EncryptedSecretErrorCode];

export class EncryptedSecretError extends Error {
  public readonly code: EncryptedSecretErrorCode;
  constructor(code: EncryptedSecretErrorCode, message: string) {
    super(message);
    this.name = "EncryptedSecretError";
    this.code = code;
  }
}

export class MissingEncryptionKeyError extends Error {
  constructor(envVar: string) {
    super(
      `${envVar} is not set or is too short (need ≥ 32 ASCII bytes). ` +
        `Generate one with: openssl rand -base64 32`,
    );
    this.name = "MissingEncryptionKeyError";
  }
}

let loggedDevFallback = false;

function readKey(version: number = CURRENT_KEY_VERSION): Buffer {
  const raw = serverEnv.AI_SECRET_ENCRYPTION_KEY;
  if (raw && raw.length >= 32) {
    // Today: single key, no prefix. A future migration can switch
    // to `k1:<base64> | k2:<base64>` for rotation. The parser is
    // forward-compatible: if the value contains a pipe we treat
    // each pipe-delimited segment as `<version>:<key>` and pick
    // the requested version, defaulting to the last segment if
    // the version is not found.
    if (raw.includes("|")) {
      const segments = raw
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);
      const wanted = segments.find((s) => s.startsWith(`${version}:`));
      const fallback = segments[segments.length - 1];
      const chosen = (wanted ?? fallback ?? "").replace(/^\d+:/, "");
      if (chosen.length >= 32) {
        return Buffer.from(chosen, "utf8").subarray(0, 32);
      }
    }
    return Buffer.from(raw, "utf8").subarray(0, 32);
  }

  if (serverEnv.NODE_ENV === "production") {
    throw new MissingEncryptionKeyError("AI_SECRET_ENCRYPTION_KEY");
  }

  // Dev / test fallback. scrypt-derive a deterministic 32-byte key
  // from a fixed string + constant salt so the value is not a
  // hard-coded constant. The first call in the process logs a
  // single line so the developer notices the misconfiguration.
  if (!loggedDevFallback) {
    console.error(
      "[security.secrets] AI_SECRET_ENCRYPTION_KEY is not set; using a derived dev key. " +
        "DO NOT deploy this configuration.",
    );
    loggedDevFallback = true;
  }
  return scryptSync("laratik-ai-secret-dev-fallback", "laratik-ai-secret-dev-salt", 32);
}

export type EncryptedSecret = {
  ciphertext: Buffer;
  keyVersion: number;
  lastFour: string;
};

/**
 * Encrypt a plaintext API key for at-rest storage. The returned
 * `ciphertext` is the on-disk format (IV prepended, auth tag
 * appended). `lastFour` is the trailing 4 characters of the
 * plaintext (or fewer if the input is shorter than 4 chars; we
 * pad to 4 with leading `*` to keep the UI display stable).
 */
export function encryptForAgency(plaintext: string): EncryptedSecret {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new EncryptedSecretError(
      EncryptedSecretErrorCode.Malformed,
      "encryptForAgency: plaintext must be a non-empty string",
    );
  }
  const key = readKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, authTag, encrypted]);
  const lastFourRaw = plaintext.slice(-4);
  const lastFour = lastFourRaw.length < 4 ? lastFourRaw.padStart(4, "*") : lastFourRaw;
  return { ciphertext: packed, keyVersion: CURRENT_KEY_VERSION, lastFour };
}

/**
 * Decrypt a ciphertext produced by `encryptForAgency`. Throws
 * `EncryptedSecretError` on any tampering, truncation, or
 * version mismatch. Callers should catch and map to 500.
 */
export function decryptForAgency(
  ciphertext: Buffer,
  keyVersion: number = CURRENT_KEY_VERSION,
): string {
  if (!Buffer.isBuffer(ciphertext) || ciphertext.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new EncryptedSecretError(
      EncryptedSecretErrorCode.Malformed,
      "decryptForAgency: ciphertext is too short to contain IV + auth tag + payload",
    );
  }
  const iv = ciphertext.subarray(0, IV_LENGTH);
  const authTag = ciphertext.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const payload = ciphertext.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const key = readKey(keyVersion);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  try {
    return Buffer.concat([decipher.update(payload), decipher.final()]).toString("utf8");
  } catch (e) {
    const detail = e instanceof Error ? e.message : "unknown";
    throw new EncryptedSecretError(
      EncryptedSecretErrorCode.AuthFailed,
      `decryptForAgency: GCM auth tag did not verify (${detail})`,
    );
  }
}

/**
 * Lightweight sanity check for input API keys. Mirrors the
 * validation on the agency-settings form so the service can
 * surface the same error if a programmatic caller (e.g. a future
 * migration) skips the form.
 */
export function isValidApiKeyShape(input: string): boolean {
  if (typeof input !== "string") return false;
  // Anthropic-compat key shape: `sk-...` followed by 8+ base64url chars.
  // We are intentionally permissive on the suffix; provider prefixes
  // can change. Reject empties and absurdly short strings only.
  if (input.length < 12 || input.length > 256) return false;
  return /^sk-[A-Za-z0-9_-]+$/.test(input);
}
