/**
 * User-facing copy for NextAuth v5 error codes surfaced via
 * `/signin?error=<code>`. Codes not in this map fall back to a generic
 * message so we never leak an internal error string to the user.
 *
 * Reference: https://authjs.dev/reference/core/errors
 */
const MESSAGES: Record<string, string> = {
  Configuration:
    "Sign-in is not configured correctly. Please contact support if this keeps happening.",
  AccessDenied: "Access to this account was denied. Ask an admin to grant you access.",
  Verification: "The sign-in link is invalid or has expired. Request a new one.",
  OAuthSignin: "We couldn't start the Google sign-in flow. Please try again.",
  OAuthCallback: "Google sign-in failed on the way back. Please try again.",
  OAuthCreateAccount: "We couldn't create your account from the Google profile.",
  EmailCreateAccount: "We couldn't create your account from that email address.",
  Callback: "Sign-in callback failed. Please try again.",
  OAuthAccountNotLinked:
    "This email is already linked to a different sign-in method. Use that one to log in.",
  EmailSignin: "We couldn't send the sign-in email. Please try again in a moment.",
  SessionRequired: "Please sign in to continue.",
  Default: "Sign-in failed. Please try again.",
};

export function authError(code: string | undefined | null): string {
  if (!code) return MESSAGES.Default!;
  return MESSAGES[code] ?? MESSAGES.Default!;
}

export const AUTH_ERROR_DEFAULT = "Default" as const;
