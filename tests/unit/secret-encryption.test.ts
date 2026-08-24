import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
 * real `.env` file. The `NODE_ENV = "production"` branch throws
 * `MissingEncryptionKeyError`; the `test` branch falls back to a
 * derived dev key.
 */

vi.mock("server-only", () => ({}));

const envMock = vi.hoisted(() => ({
  AI_SECRET_ENCRYPTION_KEY: undefined as string | undefined,
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
} = await import("@/lib/security/secrets");

beforeEach(() => {
  // A 32-byte test key. The mocks are process-wide; the key is
  // re-read on every call so beforeEach can flip the value.
  envMock.AI_SECRET_ENCRYPTION_KEY = "x".repeat(32);
  envMock.NODE_ENV = "test";
});

afterEach(() => {
  vi.unstubAllGlobals();
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

describe("MissingEncryptionKeyError (production branch)", () => {
  it("throws when the env is missing in production", () => {
    envMock.AI_SECRET_ENCRYPTION_KEY = undefined;
    envMock.NODE_ENV = "production";
    try {
      encryptForAgency("sk-test");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(MissingEncryptionKeyError);
    }
  });

  it("falls back to a derived dev key when the env is missing in test", () => {
    envMock.AI_SECRET_ENCRYPTION_KEY = undefined;
    envMock.NODE_ENV = "test";
    const a = encryptForAgency("sk-test-fallback");
    const b = decryptForAgency(a.ciphertext, a.keyVersion);
    expect(b).toBe("sk-test-fallback");
  });

  it("throws when the env is shorter than 32 bytes in production", () => {
    envMock.AI_SECRET_ENCRYPTION_KEY = "too-short";
    envMock.NODE_ENV = "production";
    try {
      encryptForAgency("sk-test");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(MissingEncryptionKeyError);
    }
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
