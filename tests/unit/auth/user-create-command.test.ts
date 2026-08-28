import { describe, expect, it } from "vitest";
import { generateStrongPassword } from "@/lib/auth/password";
import { passwordStrength, userCreateCommandSchema } from "@/lib/auth/user-create-command";

/**
 * `passwordStrength` is the client-side strength meter used by the
 * "Add directly" form. Its `accepted` boolean must mirror the
 * server's `isPasswordStrong` exactly (length >= 8 + letter + digit)
 * so a green bar always means the server would also accept the
 * password. The qualitative score + tone are advisory only.
 */
describe("passwordStrength", () => {
  it("rejects empty input", () => {
    expect(passwordStrength("").accepted).toBe(false);
    expect(passwordStrength("").tone).toBe("empty");
  });

  it("rejects passwords shorter than 8 characters", () => {
    expect(passwordStrength("Ab1").accepted).toBe(false);
    expect(passwordStrength("Ab1cde").accepted).toBe(false);
  });

  it("rejects passwords with no letter", () => {
    expect(passwordStrength("12345678").accepted).toBe(false);
  });

  it("rejects passwords with no digit", () => {
    expect(passwordStrength("abcdefgh").accepted).toBe(false);
  });

  it("accepts the minimum 8+letter+digit shape", () => {
    expect(passwordStrength("abcdefg1").accepted).toBe(true);
    expect(passwordStrength("Abcd1234").accepted).toBe(true);
  });

  it("rewards length, mixed case, and symbols with a higher score", () => {
    const weak = passwordStrength("Abcd1234");
    const longer = passwordStrength("Abcd1234efgh");
    const mixed = passwordStrength("AbCd1234efGh");
    const sym = passwordStrength("Abcd1234!@#$");
    expect(weak.score).toBeLessThanOrEqual(longer.score);
    expect(longer.score).toBeLessThanOrEqual(mixed.score);
    expect(weak.score).toBeLessThan(sym.score);
  });
});

describe("userCreateCommandSchema", () => {
  it("lowercases + trims the email", () => {
    const parsed = userCreateCommandSchema.safeParse({
      email: "  Alice@Example.COM ",
      password: "TempPass123",
      mustChangePassword: true,
      grantsAgencyAdmin: false,
      workspaceRoles: [],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.email).toBe("alice@example.com");
  });

  it("rejects an invalid email", () => {
    const parsed = userCreateCommandSchema.safeParse({
      email: "not-an-email",
      password: "TempPass123",
      mustChangePassword: true,
      grantsAgencyAdmin: false,
      workspaceRoles: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("requires a non-empty password", () => {
    const parsed = userCreateCommandSchema.safeParse({
      email: "alice@example.com",
      password: "",
      mustChangePassword: true,
      grantsAgencyAdmin: false,
      workspaceRoles: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("defaults mustChangePassword to true and grantsAgencyAdmin to false when missing", () => {
    // mustChangePassword defaults to true on the "Add directly" form
    // because admin-supplied passwords are a security anti-pattern
    // unless the user is forced to rotate on first sign-in. The
    // form's checkbox is defaultChecked for the same reason.
    const parsed = userCreateCommandSchema.safeParse({
      email: "alice@example.com",
      password: "TempPass123",
      workspaceRoles: [],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.mustChangePassword).toBe(true);
    expect(parsed.data?.grantsAgencyAdmin).toBe(false);
  });

  it("rejects an invalid workspace role", () => {
    const parsed = userCreateCommandSchema.safeParse({
      email: "alice@example.com",
      password: "TempPass123",
      workspaceRoles: [
        { workspaceId: "00000000-0000-0000-0000-000000000000", role: "nope" as never },
      ],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("generateStrongPassword", () => {
  it("returns a 16-character string", () => {
    const pw = generateStrongPassword();
    expect(pw).toHaveLength(16);
  });

  it("always passes isPasswordStrong (length + letter + digit)", () => {
    // Run 50x — the entropy (24 random bytes → 16 chars over a 70-char
    // alphabet) is high enough that collisions are essentially
    // impossible, but a 50-iteration smoke test catches any
    // catastrophic regression in the alphabet or the modulo.
    for (let i = 0; i < 50; i++) {
      const pw = generateStrongPassword();
      expect(pw).toMatch(/[A-Za-z]/);
      expect(pw).toMatch(/[0-9]/);
      expect(pw.length).toBeGreaterThanOrEqual(8);
    }
  });

  it("returns different values on consecutive calls (entropy check)", () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i++) {
      set.add(generateStrongPassword());
    }
    // 100 unique 16-char passwords over a 70-char alphabet — the
    // expected collision count is effectively 0. Allow up to 1
    // collision to absorb a single birthday-paradox edge.
    expect(set.size).toBeGreaterThanOrEqual(99);
  });
});
