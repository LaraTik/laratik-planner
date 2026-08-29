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

  it("returns false from the catch path when signedInEmail is malformed", () => {
    // The catch block in `invitationIdentityMatches` swallows
    // a throw from `normalizeEmailAddress` on a malformed
    // `signedInEmail` and returns false. This is the defensive
    // path: the sign-in flow should already have validated the
    // email, but a stale or hand-constructed payload can't take
    // down the invite-accept route.
    expect(
      invitationIdentityMatches({
        invitedEmail: "alice@example.com",
        signedInEmail: "not-an-email",
        emailVerifiedAt: new Date(),
      }),
    ).toBe(false);
  });
});
