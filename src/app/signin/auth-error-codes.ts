/**
 * User-facing copy for NextAuth v5 error codes surfaced via
 * `/signin?error=<code>`. Codes not in this map fall back to a generic
 * message so we never leak an internal error string to the user.
 *
 * Reference: https://authjs.dev/reference/core/errors
 *
 * Both legacy (NextAuth v4) and modern (@auth/core 0.41.x, the version
 * that ships under `next-auth@5.0.0-beta.32`) names are listed so:
 *   - any code we redirect to ourselves (e.g. the rate-limit redirect
 *     in `src/app/signin/page.tsx` uses the legacy `EmailSignin`) keeps
 *     working without a rename; and
 *   - any code that @auth/core starts surfacing after a beta upgrade
 *     is already mapped to a useful message.
 */
const MESSAGES: Record<string, string> = {
  // ── Generic / auth-flow ──────────────────────────────────────────────
  Configuration:
    "Sign-in is not configured correctly. Please contact support if this keeps happening.",
  AccessDenied: "Access to this account was denied. Ask an admin to grant you access.",
  Verification: "The sign-in link is invalid or has expired. Request a new one.",
  Callback: "Sign-in callback failed. Please try again.",
  CallbackRouteError: "Sign-in callback failed. Please try again.",
  SessionRequired: "Please sign in to continue.",

  // ── OAuth (Google) ───────────────────────────────────────────────────
  OAuthSignin: "We couldn't start the Google sign-in flow. Please try again.",
  OAuthSignInError: "We couldn't start the Google sign-in flow. Please try again.",
  OAuthCallback: "Google sign-in failed on the way back. Please try again.",
  OAuthCallbackError: "Google sign-in failed on the way back. Please try again.",
  OAuthCreateAccount: "We couldn't create your account from the Google profile.",
  OAuthAccountNotLinked:
    "This email is already linked to a different sign-in method. Use that one to log in.",

  // ── Email / magic link ──────────────────────────────────────────────
  // `EmailSignin` is the legacy camelCase name we redirect to from the
  // rate-limit guard in src/app/signin/page.tsx. `EmailSignInError` is
  // the modern PascalCase name that our custom `sendVerificationEmail`
  // wrapper throws (see src/lib/email/index.ts) and that @auth/core
  // 0.41.x surfaces. Both map to the same user-facing message.
  EmailSignin: "We couldn't send the sign-in email. Please try again in a moment.",
  EmailSignInError: "We couldn't send the sign-in email. Please try again in a moment.",
  EmailCreateAccount: "We couldn't create your account from that email address.",

  // ── Credentials ─────────────────────────────────────────────────────
  CredentialsSignin: "That email or password is wrong. Try again or use Forgot password.",

  // ── Default fallback ───────────────────────────────────────────────
  Default: "Sign-in failed. Please try again.",
};

export function authError(code: string | undefined | null): string {
  if (!code) return MESSAGES.Default!;
  return MESSAGES[code] ?? MESSAGES.Default!;
}

export const AUTH_ERROR_DEFAULT = "Default" as const;
