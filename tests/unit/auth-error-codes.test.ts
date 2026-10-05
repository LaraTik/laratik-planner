import { describe, expect, it } from "vitest";
import { authError, AUTH_ERROR_DEFAULT } from "@/app/signin/auth-error-codes";
import { tFor } from "@/messages";

/**
 * Locked-in copy for the user-facing NextAuth error message map.
 *
 * Regression guard: changing a message is a UX change that warrants
 * a design review (per the Stitch parity contract). New @auth/core
 * error types should be added here deliberately, not silently.
 *
 * The `authError` function takes a bound translator as its
 * first argument so the same test can pin both the English
 * and the Arabic shape. The Arabic parity is asserted in
 * `tests/unit/i18n/auth-error-codes.test.ts`.
 */

const t = tFor("en");
const callAuthError = (code: Parameters<typeof authError>[1]) => authError(t, code);

describe("authError", () => {
  it("returns the canonical Configuration message for the misleading 'Configuration' code", () => {
    // This is the most important one in the file: @auth/core 0.41.x
    // re-classifies non-AuthError throws from the Nodemailer provider
    // as `Configuration` and buries the real SMTP error. Until we
    // either patch @auth/core or upgrade past the misclassification
    // (tracked), the user will see this copy. The string MUST match
    // the one we cite in src/lib/auth/config.ts:91-95.
    expect(callAuthError("Configuration")).toBe(
      "Sign-in is not configured correctly on the server. Please contact support if this keeps happening.",
    );
  });

  it("gives each password-sign-in failure its own actionable message", () => {
    // REVERTED CONTROL (2026-10-05) — this assertion used to be:
    //
    //   expect(callAuthError("InvalidEmail")).toBe(
    //     callAuthError("CredentialsSignin"),
    //   );
    //
    // The old form conflated "typed nothing / malformed email" with
    // "wrong password" so an unauthenticated probe could not tell the
    // states apart by reading the string. That anti-enumeration property
    // was DELIBERATELY GIVEN UP: NextAuth's Credentials provider can only
    // return `user | null`, so all three refusals rendered one message,
    // and an account with no password at all (created via Google or a
    // magic link) was told to retry a password it was never issued.
    //
    // Distinguishing "no such account" from "wrong password" makes this
    // form an account oracle. That is an accepted trade-off for an
    // invite-only tool where every legitimate visitor already belongs to
    // a known agency, and `precheckPasswordSignIn` still burns an
    // identical bcrypt cost on every refusal so the split is not also
    // handed out through response timing.
    //
    // To restore the closed set: return `unknown_account` for all three
    // refusals in `precheckPasswordSignIn` and point `InvalidEmail` and
    // `PasswordRequired` back at the `CredentialsSignin` string. The
    // decision lives in exactly two places, deliberately.
    const codes = ["NoSuchAccount", "PasswordNotSet", "PasswordWrong", "PasswordRequired"];
    const messages = codes.map(callAuthError);

    // Every code has its own copy...
    expect(new Set(messages).size).toBe(codes.length);
    // ...and none of them falls through to the generic bucket, which stays
    // reserved for genuinely unknown/internal codes.
    const generic = callAuthError("SomeMadeUpCodeThatIsNotInTheMap");
    for (const message of messages) {
      expect(message).not.toBe(generic);
    }
  });

  it("InvalidEmail reports a format problem, not a credential problem", () => {
    // Telling someone their address is malformed leaks nothing about
    // whether an account exists — this is input validation, not an
    // account lookup — so it is honest to name it precisely.
    expect(callAuthError("InvalidEmail")).toMatch(/valid email address/i);
    expect(callAuthError("InvalidEmail")).not.toBe(callAuthError("NoSuchAccount"));
  });

  it("every copy tells the visitor what to do next", () => {
    // Per the error-clarity rule: state the cause AND the recovery path.
    // A user who only learns "this failed" has learned nothing actionable.
    const actionable = ["NoSuchAccount", "PasswordNotSet", "PasswordWrong", "PasswordRequired"];
    for (const code of actionable) {
      expect(callAuthError(code), `${code} should offer a recovery path`).toMatch(
        /try|check|ask|sign in|use|enter|set one|reset/i,
      );
    }
  });

  it("maps the new RateLimited code to a throttle-specific message", () => {
    // Distinct copy so the user knows the issue is a throttle, not
    // wrong credentials. The throttle is per (email, source IP) at
    // 5/hour (see src/lib/security/rate-limit.ts). The string must
    // NOT match CredentialsSignin — the two failure modes are very
    // different operationally and the user needs to know to wait.
    const msg = callAuthError("RateLimited");
    expect(msg).not.toBe(callAuthError("CredentialsSignin"));
    expect(msg).toMatch(/too many|wait/i);
  });

  it("falls back to a generic message for an unknown code (defense against internal-error leakage)", () => {
    expect(callAuthError("SomeMadeUpCodeThatIsNotInTheMap")).toBe(
      "Sign-in failed. Please try again.",
    );
  });

  it("the legacy EmailSignin and the modern EmailSignInError codes share a single message", () => {
    expect(callAuthError("EmailSignin")).toBe(callAuthError("EmailSignInError"));
  });

  it("OAuthSignin and OAuthSignInError share a single message (legacy + modern aliases)", () => {
    expect(callAuthError("OAuthSignin")).toBe(callAuthError("OAuthSignInError"));
  });

  it("OAuthCallback and OAuthCallbackError share a single message (legacy + modern aliases)", () => {
    expect(callAuthError("OAuthCallback")).toBe(callAuthError("OAuthCallbackError"));
  });

  it("Callback and CallbackRouteError share a single message", () => {
    expect(callAuthError("Callback")).toBe(callAuthError("CallbackRouteError"));
  });

  it("falls back to the Default message when the code is null or undefined", () => {
    expect(callAuthError("SomeRandomFutureCode")).toBe(callAuthError(AUTH_ERROR_DEFAULT));
    expect(callAuthError(null)).toBe(callAuthError(AUTH_ERROR_DEFAULT));
    expect(callAuthError(undefined)).toBe(callAuthError(AUTH_ERROR_DEFAULT));
    expect(callAuthError("")).toBe(callAuthError(AUTH_ERROR_DEFAULT));
  });

  it("Unknown surfaces a copy that asks the user to share the support reference", () => {
    const msg = callAuthError("Unknown");
    expect(msg.toLowerCase()).toContain("reference");
    // The reference id is rendered as a separate element;
    // it must not leak into the catalog string itself.
    expect(msg).not.toMatch(/\$\{ref\}|\{ref\}/);
  });

  it("the Default constant is the literal string 'Default'", () => {
    expect(AUTH_ERROR_DEFAULT).toBe("Default");
  });
});
