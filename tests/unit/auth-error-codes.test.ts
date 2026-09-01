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

  it("maps the new InvalidEmail (anti-enumeration) code to the wrong-credentials copy", () => {
    // The form action in src/app/signin/page.tsx redirects to
    // ?error=InvalidEmail when the email fails Zod validation OR the
    // password is empty. The user MUST see the same copy as
    // CredentialsSignin — otherwise an unauthenticated probe can
    // distinguish "user typed nothing" from "user typed the wrong
    // password" by reading the rendered error string.
    expect(callAuthError("InvalidEmail")).toBe(callAuthError("CredentialsSignin"));
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
