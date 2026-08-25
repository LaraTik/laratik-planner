import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Unit tests for `src/lib/security/secrets.ts` (M3.4 — AI in-DB secret).
 *
 * The encryption contract is:
 *   - `encryptForAgency(plaintext)` returns a `Buffer` that bundles
 *     `iv(12) || authTag(16) || ciphertext`, plus the `keyVersion`
 *     and the trailing 4 characters (`lastFour`).
 *   - `decryptForAgency(ciphertext, keyVersion)` is the inverse
 *     and throws `EncryptedSecretError` on any tampering.
 *   - The helpers never `console.log` the plaintext or the key.
 *
 * The env is mocked at the `serverEnv` shape so the test can
 * exercise the production / dev branches without leaking into the
 * real `.env` file. The `NODE_ENV = "production"` branch
 * auto-generates a KEK file (the file path is controlled by
 * `LARATIK_DATA_DIR`, mocked to a per-test temp dir so no real
 * file is written); the `test` branch falls back to a derived
 * dev key.
 */

vi.mock("server-only", () => ({}));

const envMock = vi.hoisted(() => ({
  AI_SECRET_ENCRYPTION_KEY: undefined as string | undefined,
  LARATIK_DATA_DIR: undefined as string | undefined,
  NODE_ENV: "test" as "development" | "production" | "test",
  MINIMAX_API_KEY: "sk-test",
  MINIMAX_BASE_URL: "https://api.example.com",
  MINIMAX_MODEL: "MiniMax-M3",
  AI_FEATURE_ENABLED: false,
  AUTH_SECRET: "x".repeat(32),
  AGENCY_COOKIE_SECRET: "x".repeat(64),
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
}));

vi.mock("@/lib/validation/env", () => ({
  serverEnv: new Proxy(
    {},
    {
      get: (_t, key: string) => (envMock as Record<string, unknown>)[key],
    },
  ),
}));

const {
  encryptForAgency,
  decryptForAgency,
  isValidApiKeyShape,
  EncryptedSecretError,
  EncryptedSecretErrorCode,
  MissingEncryptionKeyError,
  getKekStatus,
  __resetKekFileCacheForTests,
  __getKekFilePathForTests,
  __kekFileExistsForTests,
} = await import("@/lib/security/secrets");

let tmpDir: string | null = null;

function setupTmpDataDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "kek-test-"));
  envMock.LARATIK_DATA_DIR = dir;
  tmpDir = dir;
  return dir;
}

function teardownTmpDataDir(): void {
  if (tmpDir) {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
    envMock.LARATIK_DATA_DIR = undefined;
    tmpDir = null;
  }
}

beforeEach(() => {
  // A 32-byte test key. The mocks are process-wide; the key is
  // re-read on every call so beforeEach can flip the value.
  envMock.AI_SECRET_ENCRYPTION_KEY = "x".repeat(32);
  envMock.NODE_ENV = "test";
  envMock.LARATIK_DATA_DIR = undefined;
  tmpDir = null;
  __resetKekFileCacheForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  teardownTmpDataDir();
});

describe("encryptForAgency + decryptForAgency (round trip)", () => {
  it("encrypts and decrypts a typical API key", () => {
    const plain = "sk-test-1234567890abcdef";
    const { ciphertext, keyVersion, lastFour } = encryptForAgency(plain);
    expect(keyVersion).toBe(1);
    expect(lastFour).toBe("cdef");
    expect(ciphertext.length).toBeGreaterThan(plain.length); // IV + auth tag
    const decrypted = decryptForAgency(ciphertext, keyVersion);
    expect(decrypted).toBe(plain);
  });

  it("uses a fresh IV per call (no two ciphertexts are identical)", () => {
    const plain = "sk-test-repeated";
    const a = encryptForAgency(plain);
    const b = encryptForAgency(plain);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(decryptForAgency(a.ciphertext, a.keyVersion)).toBe(plain);
    expect(decryptForAgency(b.ciphertext, b.keyVersion)).toBe(plain);
  });

  it("pads the lastFour when the plaintext is shorter than 4 chars", () => {
    const { lastFour } = encryptForAgency("sk");
    expect(lastFour).toBe("**sk");
  });

  it("preserves trailing 4 chars for a typical-length key", () => {
    const { lastFour } = encryptForAgency("sk-abcdefghijklmnop");
    expect(lastFour).toBe("mnop");
  });

  it("selects the requested key from a versioned rotation list", () => {
    envMock.AI_SECRET_ENCRYPTION_KEY = `1:${"a".repeat(32)} | 2:${"b".repeat(32)}`;

    const encrypted = encryptForAgency("sk-versioned-rotation");

    expect(decryptForAgency(encrypted.ciphertext, encrypted.keyVersion)).toBe(
      "sk-versioned-rotation",
    );
  });
});

describe("encryptForAgency input validation", () => {
  it("rejects an empty plaintext with the stable malformed code", () => {
    expect(() => encryptForAgency("")).toThrowError(
      expect.objectContaining({
        name: "EncryptedSecretError",
        code: EncryptedSecretErrorCode.Malformed,
      }),
    );
  });
});

describe("decryptForAgency error paths", () => {
  it("throws Malformed when the ciphertext is too short", () => {
    const tiny = Buffer.alloc(5);
    try {
      decryptForAgency(tiny, 1);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(EncryptedSecretError);
      expect((e as InstanceType<typeof EncryptedSecretError>).code).toBe(
        EncryptedSecretErrorCode.Malformed,
      );
    }
  });

  it("throws AuthFailed when a single byte of the ciphertext is flipped", () => {
    const { ciphertext, keyVersion } = encryptForAgency("sk-test-1234567890abcdef");
    const tampered = Buffer.from(ciphertext);
    // Flip one bit in the auth tag region (the second-to-last byte).
    tampered[tampered.length - 2] = tampered[tampered.length - 2]! ^ 0x01;
    try {
      decryptForAgency(tampered, keyVersion);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(EncryptedSecretError);
      expect((e as InstanceType<typeof EncryptedSecretError>).code).toBe(
        EncryptedSecretErrorCode.AuthFailed,
      );
    }
  });

  it("throws AuthFailed when the key is wrong", () => {
    const { ciphertext, keyVersion } = encryptForAgency("sk-test");
    envMock.AI_SECRET_ENCRYPTION_KEY = "y".repeat(32);
    try {
      decryptForAgency(ciphertext, keyVersion);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(EncryptedSecretError);
      expect((e as InstanceType<typeof EncryptedSecretError>).code).toBe(
        EncryptedSecretErrorCode.AuthFailed,
      );
    }
  });

  it("throws when ciphertext is not a Buffer", () => {
    try {
      // The function signature is `Buffer`; runtime callers should
      // always pass a Buffer. Casting via `as Buffer` is the
      // dangerous path we want to guard against.
      decryptForAgency("not-a-buffer" as unknown as Buffer, 1);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(EncryptedSecretError);
      expect((e as InstanceType<typeof EncryptedSecretError>).code).toBe(
        EncryptedSecretErrorCode.Malformed,
      );
    }
  });
});

describe("MissingEncryptionKeyError (env malformed branch)", () => {
  it("throws when the env is set but too short in any env", () => {
    envMock.AI_SECRET_ENCRYPTION_KEY = "too-short";
    try {
      encryptForAgency("sk-test");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(MissingEncryptionKeyError);
      expect((e as Error).message).toMatch(/invalid/i);
    }
  });

  it("throws when the env is set but the rotation chain has no valid segment", () => {
    envMock.AI_SECRET_ENCRYPTION_KEY = "1:short | 2:alsoshort";
    try {
      encryptForAgency("sk-test");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(MissingEncryptionKeyError);
    }
  });
});

describe("dev fallback (test/dev branch, no env, no file)", () => {
  it("falls back to a derived dev key when the env is missing in test", () => {
    envMock.AI_SECRET_ENCRYPTION_KEY = undefined;
    envMock.NODE_ENV = "test";
    // No temp dir / file is consulted in dev/test, so the default
    // project-local path is also bypassed.
    const a = encryptForAgency("sk-test-fallback");
    const b = decryptForAgency(a.ciphertext, a.keyVersion);
    expect(b).toBe("sk-test-fallback");
  });
});

describe("auto-managed KEK file (production branch)", () => {
  it("auto-generates a KEK file on first encrypt when env is missing in production", () => {
    const dir = setupTmpDataDir();
    envMock.AI_SECRET_ENCRYPTION_KEY = undefined;
    envMock.NODE_ENV = "production";

    const a = encryptForAgency("sk-test-autogen");
    const filePath = path.join(dir, "kek.json");

    // File should now exist
    expect(__kekFileExistsForTests()).toBe(true);
    expect(__getKekFilePathForTests()).toBe(filePath);

    // The persisted key should be a parseable JSON object with
    // the expected shape and a 32-byte key.
    const persisted = JSON.parse(readFileSync(filePath, "utf8")) as {
      v: number;
      key: string;
      createdAt: string;
    };
    expect(persisted.v).toBe(1);
    expect(typeof persisted.key).toBe("string");
    expect(persisted.key.length).toBeGreaterThanOrEqual(32);
    expect(typeof persisted.createdAt).toBe("string");

    // The temp file from the atomic write should be gone.
    expect(existsSync(`${filePath}.tmp`)).toBe(false);

    // The auto-generated key should successfully round-trip.
    const decrypted = decryptForAgency(a.ciphertext, a.keyVersion);
    expect(decrypted).toBe("sk-test-autogen");
  });

  it("uses the same persisted KEK across encrypt calls within a process", () => {
    const dir = setupTmpDataDir();
    envMock.AI_SECRET_ENCRYPTION_KEY = undefined;
    envMock.NODE_ENV = "production";

    encryptForAgency("sk-first");
    const firstPersisted = readFileSync(path.join(dir, "kek.json"), "utf8");

    encryptForAgency("sk-second");
    const secondPersisted = readFileSync(path.join(dir, "kek.json"), "utf8");

    // File should not be rewritten — first call wrote it, second
    // call reuses the in-process cache.
    expect(secondPersisted).toBe(firstPersisted);
  });

  it("uses the file's KEK if env is missing and file already exists", () => {
    const dir = setupTmpDataDir();
    const existingKey = "a".repeat(32);
    writeFileSync(
      path.join(dir, "kek.json"),
      JSON.stringify({ v: 1, key: existingKey, createdAt: "2026-01-01T00:00:00.000Z" }),
      { mode: 0o600 },
    );
    envMock.AI_SECRET_ENCRYPTION_KEY = undefined;
    envMock.NODE_ENV = "production";

    const a = encryptForAgency("sk-from-file");
    // Switch the env to the file's key and decrypt — should succeed.
    envMock.AI_SECRET_ENCRYPTION_KEY = existingKey;
    __resetKekFileCacheForTests();
    const decrypted = decryptForAgency(a.ciphertext, a.keyVersion);
    expect(decrypted).toBe("sk-from-file");
  });

  it("env wins over file when both are present (env encrypts, file cannot decrypt)", () => {
    const dir = setupTmpDataDir();
    const fileKey = "f".repeat(32);
    writeFileSync(
      path.join(dir, "kek.json"),
      JSON.stringify({ v: 1, key: fileKey, createdAt: "2026-01-01T00:00:00.000Z" }),
      { mode: 0o600 },
    );
    const envKey = "e".repeat(32);
    envMock.AI_SECRET_ENCRYPTION_KEY = envKey;
    envMock.NODE_ENV = "production";

    const a = encryptForAgency("sk-env-wins");
    // Switch to file key, try to decrypt — auth tag should fail.
    envMock.AI_SECRET_ENCRYPTION_KEY = fileKey;
    __resetKekFileCacheForTests();
    try {
      decryptForAgency(a.ciphertext, a.keyVersion);
      throw new Error("should have failed with wrong key");
    } catch (e) {
      expect(e).toBeInstanceOf(EncryptedSecretError);
      expect((e as InstanceType<typeof EncryptedSecretError>).code).toBe(
        EncryptedSecretErrorCode.AuthFailed,
      );
    }
  });

  it("throws when the KEK file is corrupt (invalid JSON)", () => {
    const dir = setupTmpDataDir();
    writeFileSync(path.join(dir, "kek.json"), "not-json{", { mode: 0o600 });
    envMock.AI_SECRET_ENCRYPTION_KEY = undefined;
    envMock.NODE_ENV = "production";
    expect(() => encryptForAgency("sk-test")).toThrow(MissingEncryptionKeyError);
  });

  it("throws when the KEK file has the wrong version", () => {
    const dir = setupTmpDataDir();
    writeFileSync(
      path.join(dir, "kek.json"),
      JSON.stringify({ v: 999, key: "x".repeat(32), createdAt: "2026-01-01T00:00:00.000Z" }),
      { mode: 0o600 },
    );
    envMock.AI_SECRET_ENCRYPTION_KEY = undefined;
    envMock.NODE_ENV = "production";
    expect(() => encryptForAgency("sk-test")).toThrow(MissingEncryptionKeyError);
  });

  it("writes the KEK file with 0600 perms", () => {
    const dir = setupTmpDataDir();
    envMock.AI_SECRET_ENCRYPTION_KEY = undefined;
    envMock.NODE_ENV = "production";
    encryptForAgency("sk-test");
    const filePath = path.join(dir, "kek.json");
    const stats = statSync(filePath);
    // 0o600 = owner read/write only. Mask out type bits.
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it("creates the data directory if it does not exist", () => {
    // setupTmpDataDir creates the parent — use a deeper subdir
    // that does not exist yet to verify mkdir behavior.
    const parent = setupTmpDataDir();
    const nestedDir = path.join(parent, "nested", "data");
    envMock.LARATIK_DATA_DIR = nestedDir;
    envMock.AI_SECRET_ENCRYPTION_KEY = undefined;
    envMock.NODE_ENV = "production";
    __resetKekFileCacheForTests();

    expect(() => encryptForAgency("sk-test")).not.toThrow();
    expect(__kekFileExistsForTests()).toBe(true);
  });
});

describe("getKekStatus (UI helper)", () => {
  it("returns source=env when the env var is set", async () => {
    envMock.AI_SECRET_ENCRYPTION_KEY = "x".repeat(32);
    const status = await getKekStatus();
    expect(status.source).toBe("env");
    expect(status.path).toBeUndefined();
  });

  it("returns source=auto-file with the file path when the file exists", async () => {
    const dir = setupTmpDataDir();
    writeFileSync(
      path.join(dir, "kek.json"),
      JSON.stringify({ v: 1, key: "x".repeat(32), createdAt: "2026-08-25T12:00:00.000Z" }),
      { mode: 0o600 },
    );
    envMock.AI_SECRET_ENCRYPTION_KEY = undefined;
    envMock.NODE_ENV = "production";
    const status = await getKekStatus();
    expect(status.source).toBe("auto-file");
    expect(status.path).toBe(path.join(dir, "kek.json"));
    expect(status.createdAt).toBe("2026-08-25T12:00:00.000Z");
    expect(status.warning).toBeUndefined();
  });

  it("returns source=auto-file with a 'will be generated' warning when the file is missing in production", async () => {
    const dir = setupTmpDataDir();
    envMock.AI_SECRET_ENCRYPTION_KEY = undefined;
    envMock.NODE_ENV = "production";
    const status = await getKekStatus();
    expect(status.source).toBe("auto-file");
    expect(status.path).toBe(path.join(dir, "kek.json"));
    expect(status.warning).toMatch(/will be auto-generated/i);
  });

  it("returns source=auto-file with a 'will NOT be regenerated' warning when the file is corrupt", async () => {
    const dir = setupTmpDataDir();
    writeFileSync(path.join(dir, "kek.json"), "{ not valid json", { mode: 0o600 });
    envMock.AI_SECRET_ENCRYPTION_KEY = undefined;
    envMock.NODE_ENV = "production";
    const status = await getKekStatus();
    expect(status.source).toBe("auto-file");
    expect(status.warning).toMatch(/will NOT be auto-regenerated/i);
  });
});

describe("isValidApiKeyShape", () => {
  it("accepts a well-formed sk-... key", () => {
    expect(isValidApiKeyShape("sk-1234567890abcdefghij")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidApiKeyShape("")).toBe(false);
  });

  it("rejects a string without the sk- prefix", () => {
    expect(isValidApiKeyShape("xx-abcdefghijklmnop")).toBe(false);
  });

  it("rejects a string shorter than 12 chars", () => {
    expect(isValidApiKeyShape("sk-short")).toBe(false);
  });

  it("rejects a non-string input", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(isValidApiKeyShape(12345 as any)).toBe(false);
  });
});

describe("large key handling", () => {
  it("round-trips a 256-byte plaintext", () => {
    const long = "sk-" + "a".repeat(252);
    const { ciphertext, lastFour } = encryptForAgency(long);
    expect(lastFour).toBe("aaaa");
    const back = decryptForAgency(ciphertext, 1);
    expect(back).toBe(long);
  });
});
