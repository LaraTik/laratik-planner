import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { readFile as readFileAsync } from "node:fs/promises";
import path from "node:path";
import { serverEnv } from "@/lib/validation/env";
import { deriveDevKey } from "./dev-key";

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
 * Key resolution (priority order):
 *   1. `AI_SECRET_ENCRYPTION_KEY` env var (operator-set). If it is
 *      set but malformed, the helper throws — the operator made a
 *      misconfiguration and we should fail loudly.
 *   2. Auto-managed KEK file at `<LARATIK_DATA_DIR>/kek.json`
 *      (default `<cwd>/.laratik-planner/kek.json`). The file is
 *      read on first call, cached for the process lifetime, and
 *      written with `0600` perms via an atomic write (`.tmp` +
 *      rename). In production, a missing file is auto-generated
 *      and persisted; in dev/test, a missing file falls through
 *      to the dev-key derivation so tests are hermetic.
 *   3. Dev / test fallback: a scrypt-derived dev key (same posture
 *      as `src/lib/auth/agency-context.ts` for `AGENCY_COOKIE_SECRET`).
 *      The dev key is **not** constant: it is scrypt-derived from
 *      a fixed string so an accidental dump of the env file does
 *      not yield a working encryption key.
 *
 * A corrupt KEK file (invalid JSON, wrong version, missing/short
 * `key` field) throws `MissingEncryptionKeyError` rather than
 * silently regenerating — a regenerated key would orphan every
 * ciphertext written under the old one.
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
  constructor(message?: string) {
    super(
      message ??
        `AI_SECRET_ENCRYPTION_KEY is not set or is too short (need ≥ 32 ASCII bytes). ` +
          `Generate one with: openssl rand -base64 32`,
    );
    this.name = "MissingEncryptionKeyError";
  }
}

// ─── Auto-managed KEK file ────────────────────────────────────────────────
//
// When AI_SECRET_ENCRYPTION_KEY is not set in the environment, the
// encryption layer auto-generates a 32-byte KEK on first use and
// persists it to a file with restrictive perms. This keeps the
// managed-secret form working out of the box on a fresh deployment
// without forcing the operator to SSH in and edit env vars, while
// preserving the security property that the KEK is a *real* key
// (not a derived/dev fallback) in production.
//
// The file lives in LARATIK_DATA_DIR (default `<cwd>/.laratik-planner/`),
// which in production MUST be a persistent volume — losing the file
// orphans every ciphertext in `ai_provider_secret`. The page UI
// surfaces the file path so the operator can back it up.

const KEK_FILENAME = "kek.json";
const KEK_FORMAT_VERSION = 1;
const KEK_FILE_MODE = 0o600;
const KEK_DIR_MODE = 0o700;

let fileKeyCache: Buffer | null | undefined = undefined; // undefined = not yet read
let loggedFileFallback = false;
let loggedDevFallback = false;

function getDataDir(): string {
  // The Zod schema's `stringOrEmpty` transform turns a missing
  // env var into `""`, so an empty trim() is the "not set" signal.
  const env = serverEnv.LARATIK_DATA_DIR?.trim();
  if (env) return env;
  return path.join(process.cwd(), ".laratik-planner");
}

function getKekFilePath(): string {
  return path.join(getDataDir(), KEK_FILENAME);
}

export type KekSource = "env" | "auto-file" | "dev-fallback";

export type KekStatus = {
  source: KekSource;
  /** Resolved path of the KEK file (always set when source is "auto-file"). */
  path?: string;
  /** ISO-8601 creation timestamp from the on-disk file, if present. */
  createdAt?: string;
  /** Operator-facing message (e.g. "will be auto-generated on next save"). */
  warning?: string;
};

type FileKeyResult =
  { ok: true; key: Buffer; createdAt?: string } | { ok: false; reason: "missing" | "corrupt" };

/**
 * Read the auto-managed KEK file. Returns `{ ok: true }` only when
 * the file exists, parses, has the right version, and the `key`
 * field is ≥ 32 bytes. A missing file is `reason: "missing"`; any
 * other failure is `reason: "corrupt"` so the caller can refuse
 * to silently regenerate (which would orphan existing ciphertexts).
 */
function readFileKeyStrictSync(): FileKeyResult {
  if (fileKeyCache !== undefined) {
    if (fileKeyCache) {
      return { ok: true, key: fileKeyCache };
    }
    return { ok: false, reason: "missing" };
  }
  const filePath = getKekFilePath();
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      fileKeyCache = null;
      return { ok: false, reason: "missing" };
    }
    fileKeyCache = null;
    return { ok: false, reason: "corrupt" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fileKeyCache = null;
    return { ok: false, reason: "corrupt" };
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as Record<string, unknown>).v !== KEK_FORMAT_VERSION ||
    typeof (parsed as Record<string, unknown>).key !== "string" ||
    ((parsed as Record<string, unknown>).key as string).length < 32
  ) {
    fileKeyCache = null;
    return { ok: false, reason: "corrupt" };
  }
  const keyStr = (parsed as Record<string, unknown>).key as string;
  const createdAt =
    typeof (parsed as Record<string, unknown>).createdAt === "string"
      ? ((parsed as Record<string, unknown>).createdAt as string)
      : undefined;
  const buf = Buffer.from(keyStr, "utf8").subarray(0, 32);
  fileKeyCache = buf;
  // exactOptionalPropertyTypes: only spread the field when defined.
  return createdAt ? { ok: true, key: buf, createdAt } : { ok: true, key: buf };
}

/**
 * Atomically write a new KEK file. The .tmp + rename pattern
 * guarantees a half-written file is never visible to readers.
 * chmod is applied *after* rename because the rename can be
 * affected by the process umask on some platforms.
 */
function writeKekFileSync(keyB64: string): string {
  const dir = getDataDir();
  mkdirSync(dir, { recursive: true, mode: KEK_DIR_MODE });
  const filePath = getKekFilePath();
  const payload = JSON.stringify(
    { v: KEK_FORMAT_VERSION, key: keyB64, createdAt: new Date().toISOString() },
    null,
    2,
  );
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, payload, { mode: KEK_FILE_MODE });
  renameSync(tmpPath, filePath);
  chmodSync(filePath, KEK_FILE_MODE);
  return filePath;
}

function decodeEnvKey(raw: string, version: number): Buffer | null {
  if (!raw || raw.length < 32) return null;
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

function readKey(version: number = CURRENT_KEY_VERSION): Buffer {
  // 1. Env var (operator-set, takes priority — must be valid).
  const raw = serverEnv.AI_SECRET_ENCRYPTION_KEY;
  if (raw) {
    const envKey = decodeEnvKey(raw, version);
    if (!envKey) {
      throw new MissingEncryptionKeyError(
        `AI_SECRET_ENCRYPTION_KEY is set but invalid (need ≥ 32 ASCII bytes, or a ` +
          `k1:<base64> | k2:<base64> rotation chain). Generate one with: ` +
          `openssl rand -base64 32`,
      );
    }
    return envKey;
  }

  // 2. Auto-managed KEK file. A corrupt file refuses to silently
  //    regenerate — that would orphan every existing ciphertext.
  const fileResult = readFileKeyStrictSync();
  if (fileResult.ok) return fileResult.key;
  if (fileResult.reason === "corrupt") {
    throw new MissingEncryptionKeyError(
      `AI_SECRET_ENCRYPTION_KEY is not set, and the auto-managed KEK file at ` +
        `${getKekFilePath()} is unreadable or corrupt. Set AI_SECRET_ENCRYPTION_KEY ` +
        `in the environment to recover. Generate one with: openssl rand -base64 32`,
    );
  }

  // 3. File missing — auto-generate in production, fall back in dev/test.
  if (serverEnv.NODE_ENV === "production") {
    const newKey = randomBytes(32);
    try {
      const filePath = writeKekFileSync(newKey.toString("base64"));
      fileKeyCache = newKey;
      if (!loggedFileFallback) {
        console.warn(
          `[security.secrets] AI_SECRET_ENCRYPTION_KEY not set in environment. ` +
            `Auto-generated KEK and persisted to ${filePath} (mode 0600). ` +
            `BACK THIS FILE UP — losing it locks out all stored AI provider keys. ` +
            `To override, set AI_SECRET_ENCRYPTION_KEY in the environment.`,
        );
        loggedFileFallback = true;
      }
      return newKey;
    } catch (writeErr) {
      throw new MissingEncryptionKeyError(
        `AI_SECRET_ENCRYPTION_KEY is not set, and the auto-managed KEK file at ` +
          `${getKekFilePath()} could not be written: ${(writeErr as Error).message}. ` +
          `Set AI_SECRET_ENCRYPTION_KEY in the environment. Generate one with: ` +
          `openssl rand -base64 32`,
      );
    }
  }

  // 4. Dev / test fallback (preserved from prior behavior so tests
  //    remain hermetic — no leftover KEK file in test sandboxes).
  if (!loggedDevFallback) {
    console.error(
      "[security.secrets] AI_SECRET_ENCRYPTION_KEY is not set; using a derived dev key. " +
        "DO NOT deploy this configuration.",
    );
    loggedDevFallback = true;
  }
  return deriveDevKey();
}

/**
 * Async status of the KEK source for the agency-settings UI.
 * Non-throwing: returns a structured `KekStatus` so the page can
 * render a "back this up" banner without catching exceptions.
 *
 * - `env` — `AI_SECRET_ENCRYPTION_KEY` is set; no action needed.
 * - `auto-file` + `path` — the file is the active source. The
 *   `warning` field is set when the file is missing/corrupt
 *   (will be regenerated / won't be regenerated respectively).
 * - `dev-fallback` — only reachable in dev/test; the file is not
 *   consulted and a derived key is used.
 */
export async function getKekStatus(): Promise<KekStatus> {
  if (serverEnv.AI_SECRET_ENCRYPTION_KEY && serverEnv.AI_SECRET_ENCRYPTION_KEY.length >= 32) {
    return { source: "env" };
  }
  const filePath = getKekFilePath();

  // Distinguish IO errors (read permission, disk error) from
  // shape errors (invalid JSON, wrong version, missing key). IO
  // errors are recoverable by the operator (chmod, fix the disk);
  // shape errors are data corruption that we will not silently
  // overwrite (a regenerated KEK would orphan every existing
  // ciphertext in `ai_provider_secret`).
  let raw: string;
  try {
    raw = await readFileAsync(filePath, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        source: "auto-file",
        path: filePath,
        warning:
          serverEnv.NODE_ENV === "production"
            ? "Will be auto-generated on the first save — back the file up afterwards."
            : "Will fall back to a derived dev key in dev/test (no file will be written).",
      };
    }
    return {
      source: "auto-file",
      path: filePath,
      warning: `Unreadable: ${(e as Error).message}`,
    };
  }

  let parsed: { v?: number; key?: string; createdAt?: string };
  try {
    parsed = JSON.parse(raw) as { v?: number; key?: string; createdAt?: string };
  } catch {
    return {
      source: "auto-file",
      path: filePath,
      warning:
        "File exists but is corrupt (invalid JSON) — it will NOT be auto-regenerated to avoid orphaning existing ciphertexts. Set AI_SECRET_ENCRYPTION_KEY to recover.",
    };
  }

  if (
    parsed.v === KEK_FORMAT_VERSION &&
    typeof parsed.key === "string" &&
    parsed.key.length >= 32
  ) {
    const createdAt = typeof parsed.createdAt === "string" ? parsed.createdAt : undefined;
    return createdAt
      ? { source: "auto-file", path: filePath, createdAt }
      : { source: "auto-file", path: filePath };
  }
  return {
    source: "auto-file",
    path: filePath,
    warning:
      "File exists but is corrupt (wrong version or shape) — it will NOT be auto-regenerated to avoid orphaning existing ciphertexts. Set AI_SECRET_ENCRYPTION_KEY to recover.",
  };
}

/**
 * Test-only helper: clears the in-process file key cache so the
 * next `readKey()` re-reads from disk. Exported only via the
 * `__resetKekFileCacheForTests` symbol to keep it out of the
 * public API. Use `vi.resetModules()` or pass a fresh envMock
 * in tests; this exists for the rare test that exercises the
 * file-write + read cycle in a single test.
 */
export function __resetKekFileCacheForTests(): void {
  fileKeyCache = undefined;
}

/** Test-only helper: returns the path the auto-managed KEK file would use. */
export function __getKekFilePathForTests(): string {
  return getKekFilePath();
}

/** Test-only helper: returns true if the KEK file currently exists on disk. */
export function __kekFileExistsForTests(): boolean {
  return existsSync(getKekFilePath());
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
