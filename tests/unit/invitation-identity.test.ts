import { describe, expect, it } from "vitest";
import { invitationIdentityMatches, normalizeEmailAddress } from "@/lib/auth/invitation-identity";

describe("invitation identity", () => {
  it("normalizes surrounding whitespace and email case", () => {
    expect(normalizeEmailAddress("  Alice.Example@Example.COM  ")).toBe(
      "alice.example@example.com",
    );
  });

  it("accepts only a verified matching identity", () => {
    expect(
      invitationIdentityMatches({
        invitedEmail: "alice@example.com",
        signedInEmail: "Alice@Example.com",
        emailVerifiedAt: new Date(),
      }),
    ).toBe(true);
    expect(
      invitationIdentityMatches({
        invitedEmail: "alice@example.com",
        signedInEmail: "mallory@example.com",
        emailVerifiedAt: new Date(),
      }),
    ).toBe(false);
    expect(
      invitationIdentityMatches({
        invitedEmail: "alice@example.com",
        signedInEmail: "alice@example.com",
        emailVerifiedAt: null,
      }),
    ).toBe(false);
  });

  it("rejects missing or malformed addresses", () => {
    expect(
      invitationIdentityMatches({
        invitedEmail: "alice@example.com",
        signedInEmail: null,
        emailVerifiedAt: new Date(),
      }),
    ).toBe(false);
    expect(() => normalizeEmailAddress("not-an-email")).toThrow(/email/i);
  });
});
