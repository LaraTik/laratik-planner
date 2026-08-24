import { scryptSync } from "node:crypto";

/**
 * Shared dev/test encryption-key fallback.
 *
 * Both the AI secret module (`src/lib/security/secrets.ts`) and the
 * social DEK module (`src/lib/social/key-management.ts`) need a
 * non-constant 32-byte key when the operator has not set the
 * corresponding env var. The dev key is scrypt-derived from a fixed
 * string with a constant salt so:
 *
 *   - it is not a hard-coded constant in the source tree
 *   - an accidental dump of the dev `.env` does not yield a working
 *     key (the salt + pass-phrase are not in any file)
 *   - the same call within a single process returns the same bytes
 *     (deterministic for tests)
 *
 * **NEVER** use this in production. The dev fallback is only
 * returned when `nodeEnv !== "production"`. The caller is
 * responsible for that gate.
 */
const DEV_KEY_PASSPHRASE = "laratik-dev-secret-fallback";
const DEV_KEY_SALT = "laratik-dev-secret-salt";

/**
 * Returns a deterministic 32-byte buffer suitable for AES-256.
 * Only call from dev / test code paths. Production code MUST set
 * the corresponding env var.
 */
export function deriveDevKey(): Buffer {
  return scryptSync(DEV_KEY_PASSPHRASE, DEV_KEY_SALT, 32);
}
