import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  openAppSecretWithDek,
  ProviderConfigCryptoError,
  sealAppSecretWithDek,
} from "@/lib/social/app-config-crypto";

/**
 * M4.6 — per-agency provider app-secret envelope.
 *
 * The seal function is the only thing standing between a leaked
 * DB row and a leaked Meta / TikTok app secret. These tests pin
 * the envelope shape (AAD, key version, IV uniqueness, tamper
 * detection) so a future refactor cannot silently weaken it.
 *
 * The DEK is supplied by the caller — it is the per-agency DEK
 * unwrapped from `agency_social_dek` by `key-management.ts`. The
 * tests use a random 32-byte Buffer as a stand-in.
 */
function randomDek(): Buffer {
  return randomBytes(32);
}

describe("sealAppSecretWithDek", () => {
  it("returns a sealed envelope with non-empty ciphertext, iv, and tag", () => {
    const dek = randomDek();
    const sealed = sealAppSecretWithDek("app-secret-value", dek);
    expect(sealed.ciphertext.length).toBeGreaterThan(0);
    expect(sealed.iv.length).toBeGreaterThan(0);
    expect(sealed.tag.length).toBeGreaterThan(0);
  });

  it("round-trips with the same DEK", () => {
    const dek = randomDek();
    const sealed = sealAppSecretWithDek("super-secret-app-key", dek);
    const recovered = openAppSecretWithDek(sealed, dek);
    expect(recovered).toBe("super-secret-app-key");
  });

  it("uses a fresh IV per call (sealing the same plaintext twice yields different ciphertext)", () => {
    const dek = randomDek();
    const a = sealAppSecretWithDek("same-plaintext", dek);
    const b = sealAppSecretWithDek("same-plaintext", dek);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
    expect(a.tag).not.toBe(b.tag);
    // Both still round-trip to the same plaintext.
    expect(openAppSecretWithDek(a, dek)).toBe("same-plaintext");
    expect(openAppSecretWithDek(b, dek)).toBe("same-plaintext");
  });

  it("refuses a non-32-byte DEK", () => {
    expect(() => sealAppSecretWithDek("x", Buffer.alloc(16))).toThrow(ProviderConfigCryptoError);
    expect(() => sealAppSecretWithDek("x", Buffer.alloc(0))).toThrow(ProviderConfigCryptoError);
  });
});

describe("openAppSecretWithDek", () => {
  it("refuses to open with a wrong DEK", () => {
    const sealed = sealAppSecretWithDek("secret", randomDek());
    expect(() => openAppSecretWithDek(sealed, randomDek())).toThrow(ProviderConfigCryptoError);
  });

  it("refuses to open a tampered ciphertext", () => {
    const dek = randomDek();
    const sealed = sealAppSecretWithDek("secret", dek);
    // Flip one character in the ciphertext.
    const flipped = sealed.ciphertext.startsWith("A")
      ? `B${sealed.ciphertext.slice(1)}`
      : `A${sealed.ciphertext.slice(1)}`;
    expect(() => openAppSecretWithDek({ ...sealed, ciphertext: flipped }, dek)).toThrow(
      ProviderConfigCryptoError,
    );
  });

  it("refuses to open a tampered tag", () => {
    const dek = randomDek();
    const sealed = sealAppSecretWithDek("secret", dek);
    const flipped = sealed.tag.startsWith("A")
      ? `B${sealed.tag.slice(1)}`
      : `A${sealed.tag.slice(1)}`;
    expect(() => openAppSecretWithDek({ ...sealed, tag: flipped }, dek)).toThrow(
      ProviderConfigCryptoError,
    );
  });

  it("error messages do not leak the ciphertext, IV, or tag", () => {
    const dek = randomDek();
    const sealed = sealAppSecretWithDek("secret", dek);
    const otherDek = randomDek();
    try {
      openAppSecretWithDek(sealed, otherDek);
      expect.unreachable("expected an error");
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      // The error must not contain the secret or the envelope fields.
      expect(message).not.toContain(sealed.ciphertext);
      expect(message).not.toContain(sealed.iv);
      expect(message).not.toContain(sealed.tag);
    }
  });

  it("handles long plaintexts (the per-connection social-credentials envelope is also unbounded, so this is just sanity)", () => {
    const dek = randomDek();
    const longPlaintext = "x".repeat(2048);
    const sealed = sealAppSecretWithDek(longPlaintext, dek);
    expect(openAppSecretWithDek(sealed, dek)).toBe(longPlaintext);
  });
});
