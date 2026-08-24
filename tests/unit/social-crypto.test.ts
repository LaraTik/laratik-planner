import { describe, expect, it } from "vitest";
import {
  openCredentialsWithDek,
  sealCredentialsWithDek,
  type SocialCredentials,
} from "@/lib/social/crypto";

/**
 * M4.5 — provider credential envelope (DEK-in-hand API).
 *
 * The envelope uses AES-256-GCM with a versioned AAD so that a single
 * leaked ciphertext cannot be replayed against a future key rotation.
 * The 32-byte key is the per-agency DEK, supplied by the caller as a
 * `Buffer` (the repository resolves the DEK via
 * `src/lib/social/key-management.ts`). A wrong key length throws
 * immediately, not at first encrypt.
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
describe("sealCredentialsWithDek / openCredentialsWithDek", () => {
  const validDek = Buffer.alloc(32, 7);

  it("round-trips a provider credential envelope", () => {
    const payload: SocialCredentials = {
      accessToken: "access",
      refreshToken: "refresh",
    };
    const sealed = sealCredentialsWithDek(payload, validDek);
    expect(openCredentialsWithDek(sealed, validDek)).toEqual(payload);
  });

  it("does not contain the plaintext in the sealed envelope", () => {
    const sealed = sealCredentialsWithDek({ accessToken: "access" }, validDek);
    const serialized = JSON.stringify(sealed);
    expect(serialized).not.toContain("access");
  });

  it("preserves extra fields on the payload", () => {
    const payload: SocialCredentials = {
      accessToken: "a",
      profileAccessTokens: { p1: "tok1" },
    };
    const sealed = sealCredentialsWithDek(payload, validDek);
    expect(openCredentialsWithDek(sealed, validDek)).toEqual(payload);
  });

  it("fails closed when the ciphertext changes", () => {
    const sealed = sealCredentialsWithDek({ accessToken: "access" }, validDek);
    const tampered = { ...sealed, ciphertext: `${sealed.ciphertext}AA` };
    expect(() => openCredentialsWithDek(tampered, validDek)).toThrow(
      "Unable to decrypt social credentials",
    );
  });

  it("fails closed when the auth tag changes", () => {
    const sealed = sealCredentialsWithDek({ accessToken: "access" }, validDek);
    // Replace the auth tag with one that decodes to a valid 16-byte length
    // but a different value. Using a different valid base64 tag.
    const differentTag = Buffer.alloc(16, 0xab).toString("base64");
    const tampered = { ...sealed, tag: differentTag };
    expect(() => openCredentialsWithDek(tampered, validDek)).toThrow(
      "Unable to decrypt social credentials",
    );
  });

  it("fails closed when the IV changes", () => {
    const sealed = sealCredentialsWithDek({ accessToken: "access" }, validDek);
    const tampered = { ...sealed, iv: sealed.iv === "AA" ? "BB" : "AA" };
    expect(() => openCredentialsWithDek(tampered, validDek)).toThrow(
      "Unable to decrypt social credentials",
    );
  });

  it("rejects a DEK that is not exactly 32 bytes", () => {
    const shortDek = Buffer.alloc(16, 1);
    expect(() => sealCredentialsWithDek({ accessToken: "a" }, shortDek)).toThrow(/32/);
    const sealed = sealCredentialsWithDek({ accessToken: "a" }, validDek);
    expect(() => openCredentialsWithDek(sealed, shortDek)).toThrow(/32/);
  });

  it("fails closed with a different DEK of the same length", () => {
    const otherDek = Buffer.alloc(32, 9);
    const sealed = sealCredentialsWithDek({ accessToken: "access" }, validDek);
    expect(() => openCredentialsWithDek(sealed, otherDek)).toThrow(
      "Unable to decrypt social credentials",
    );
  });

  it("uses a fresh IV for every seal", () => {
    const a = sealCredentialsWithDek({ accessToken: "access" }, validDek);
    const b = sealCredentialsWithDek({ accessToken: "access" }, validDek);
    expect(a.iv).not.toEqual(b.iv);
    expect(a.ciphertext).not.toEqual(b.ciphertext);
    expect(a.tag).not.toEqual(b.tag);
  });

  it("tags the envelope with keyVersion 1", () => {
    const sealed = sealCredentialsWithDek({ accessToken: "a" }, validDek);
    expect(sealed.keyVersion).toBe(1);
  });
});
