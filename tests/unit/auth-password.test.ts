import { describe, expect, it } from "vitest";
import { hashPassword, isPasswordStrong, verifyPassword } from "@/lib/auth/password";

/**
 * These tests pin the password helper contract. The full token
 * round-trip needs a real DB and is covered by the integration
 * tests; here we only cover the pieces that can be unit-tested
 * without a Postgres connection.
 */
describe("password helpers", () => {
  it("hashPassword uses bcrypt cost 12 and produces a verifiable hash", async () => {
    const hash = await hashPassword("hello-world-42");
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(await verifyPassword("hello-world-42", hash)).toBe(true);
    expect(await verifyPassword("hello-world-43", hash)).toBe(false);
  });

  it("verifyPassword returns false for malformed hashes", async () => {
    expect(await verifyPassword("anything", "not-a-bcrypt-hash")).toBe(false);
  });

  it("isPasswordStrong enforces minimum length and mixed character classes", () => {
    expect(isPasswordStrong("short1")).toBe(false); // < 8
    expect(isPasswordStrong("alllowercase-nodigits")).toBe(false);
    expect(isPasswordStrong("ALL-UPPER-NO-LETTERS-9")).toBe(true); // has letters + digits
    expect(isPasswordStrong("12345678")).toBe(false); // no letters
    expect(isPasswordStrong("abcdefgh")).toBe(false); // no digits
    expect(isPasswordStrong("Abcdefg1")).toBe(true); // valid
    expect(isPasswordStrong("a".repeat(201) + "1")).toBe(false); // > 200
  });

  it("isPasswordStrong rejects non-string inputs safely", () => {
    expect(isPasswordStrong(undefined as unknown as string)).toBe(false);
    expect(isPasswordStrong(null as unknown as string)).toBe(false);
    expect(isPasswordStrong(42 as unknown as string)).toBe(false);
  });
});
