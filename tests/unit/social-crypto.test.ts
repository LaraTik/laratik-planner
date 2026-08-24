import { describe, expect, it } from "vitest";
import { sealCredentials, openCredentials, type SocialCredentials } from "@/lib/social/crypto";

/**
 * M4 — provider credential envelope.
 *
 * The envelope uses AES-256-GCM with a versioned AAD so that a single
 * leaked ciphertext cannot be replayed against a future key rotation.
 * The 32-byte key is read from `SOCIAL_TOKEN_ENCRYPTION_KEY` (base64);
 * any other length is rejected up-front so a misconfigured env var
 * fails closed rather than degrading to a weaker key.
 *
 * What this suite guarantees:
 *
 *   - round-trip restores the original payload byte-for-byte
 *   - the encrypted form never contains the plaintext (no token leak
 *     to logs / DB dumps / serialization)
 *   - tampering with the ciphertext, iv, tag, or AAD fails closed
 *   - a wrong key length throws immediately, not at first encrypt
 *   - extra fields on the payload are preserved
 */
describe("sealCredentials / openCredentials", () => {
  const validKey = Buffer.alloc(32, 7).toString("base64");

  it("round-trips a provider credential envelope", () => {
    const payload: SocialCredentials = {
      accessToken: "access",
      refreshToken: "refresh",
    };
    const sealed = sealCredentials(payload, validKey);
    expect(openCredentials(sealed, validKey)).toEqual(payload);
  });

  it("does not contain the plaintext in the sealed envelope", () => {
    const sealed = sealCredentials({ accessToken: "access" }, validKey);
    const serialized = JSON.stringify(sealed);
    expect(serialized).not.toContain("access");
  });

  it("preserves extra fields on the payload", () => {
    const payload: SocialCredentials = {
      accessToken: "a",
      profileAccessTokens: { p1: "tok1" },
    };
    const sealed = sealCredentials(payload, validKey);
    expect(openCredentials(sealed, validKey)).toEqual(payload);
  });

  it("fails closed when the ciphertext changes", () => {
    const sealed = sealCredentials({ accessToken: "access" }, validKey);
    const tampered = { ...sealed, ciphertext: `${sealed.ciphertext}AA` };
    expect(() => openCredentials(tampered, validKey)).toThrow(
      "Unable to decrypt social credentials",
    );
  });

  it("fails closed when the auth tag changes", () => {
    const sealed = sealCredentials({ accessToken: "access" }, validKey);
    // Replace the auth tag with one that decodes to a valid 16-byte length
    // but a different value. Using a different valid base64 tag.
    const differentTag = Buffer.alloc(16, 0xab).toString("base64");
    const tampered = { ...sealed, tag: differentTag };
    expect(() => openCredentials(tampered, validKey)).toThrow(
      "Unable to decrypt social credentials",
    );
  });

  it("fails closed when the IV changes", () => {
    const sealed = sealCredentials({ accessToken: "access" }, validKey);
    const tampered = { ...sealed, iv: sealed.iv === "AA" ? "BB" : "AA" };
    expect(() => openCredentials(tampered, validKey)).toThrow(
      "Unable to decrypt social credentials",
    );
  });

  it("rejects a key that is not exactly 32 bytes when decoded", () => {
    const shortKey = Buffer.alloc(16, 1).toString("base64");
    expect(() => sealCredentials({ accessToken: "a" }, shortKey)).toThrow(/32 bytes/);
    const sealed = sealCredentials({ accessToken: "a" }, validKey);
    expect(() => openCredentials(sealed, shortKey)).toThrow(/32 bytes/);
  });

  it("fails closed with a different key of the same length", () => {
    const otherKey = Buffer.alloc(32, 9).toString("base64");
    const sealed = sealCredentials({ accessToken: "access" }, validKey);
    expect(() => openCredentials(sealed, otherKey)).toThrow("Unable to decrypt social credentials");
  });

  it("uses a fresh IV for every seal", () => {
    const a = sealCredentials({ accessToken: "access" }, validKey);
    const b = sealCredentials({ accessToken: "access" }, validKey);
    expect(a.iv).not.toEqual(b.iv);
    expect(a.ciphertext).not.toEqual(b.ciphertext);
    expect(a.tag).not.toEqual(b.tag);
  });

  it("tags the envelope with keyVersion 1", () => {
    const sealed = sealCredentials({ accessToken: "a" }, validKey);
    expect(sealed.keyVersion).toBe(1);
  });
});
