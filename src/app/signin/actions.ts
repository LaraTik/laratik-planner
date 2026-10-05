"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/lib/auth/config";
import { precheckPasswordSignIn } from "@/lib/auth/password";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { emailDomain, signInErrorRedirect } from "./auth-error-server";

const SignInEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

function isRedirectError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message === "NEXT_REDIRECT" ||
    error.message === "NEXT_NOT_FOUND" ||
    typeof (error as { digest?: unknown }).digest === "string"
  );
}

function errorUrl(code: string, callbackUrl: string, method?: "magic"): string {
  const query = new URLSearchParams({ error: code, callbackUrl });
  if (method) query.set("method", method);
  return `/signin?${query.toString()}`;
}

async function rateLimitSubject(email: string, prefix = ""): Promise<boolean> {
  const requestHeaders = await headers();
  const requestId = requestHeaders.get("x-request-id");
  const source = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? email;
  const limit = await enforceRateLimit({
    scope: "magic_link_request",
    subject: `${prefix}${email}::${source}`,
    ...(requestId ? { requestId } : {}),
  });
  return limit.allowed;
}

export async function signInWithPasswordAction(
  callbackUrl: string,
  formData: FormData,
): Promise<void> {
  const rawEmail = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const remember = String(formData.get("remember") ?? "");
  const parsed = SignInEmailSchema.safeParse({ email: rawEmail });

  if (!parsed.success) {
    redirect(errorUrl("InvalidEmail", callbackUrl));
  }
  if (!password) {
    redirect(errorUrl("PasswordRequired", callbackUrl));
  }
  const email = parsed.data.email;
  if (!(await rateLimitSubject(email))) {
    redirect(errorUrl("RateLimited", callbackUrl));
  }

  // Classify the attempt BEFORE handing it to NextAuth.
  //
  // NextAuth's Credentials provider can only return `user | null`, so
  // every refusal — unknown email, registered-but-passwordless account,
  // and genuinely wrong password — arrives at the user as the single
  // `CredentialsSignin` message "That email or password is wrong". That
  // was actively misleading for a passwordless account: the visitor is
  // told to retry a password they were never issued, and "Forgot
  // password" is offered as though one exists. The pre-check resolves
  // the three cases so each gets its own copy.
  //
  // `can_sign_in` is not authoritative — we still call `signIn()` below
  // and let NextAuth do the real verification, so the session, the JWT
  // claims and the failure logging all stay on one code path.
  //
  // Security note: this distinguishes "no such account" from "wrong
  // password" on purpose, which does make the sign-in form an account
  // oracle. That is the requested product behaviour for an invite-only
  // internal tool, where every legitimate visitor already belongs to a
  // known agency. `precheckPasswordSignIn` still burns an identical
  // bcrypt cost on every refusal, so the split is not free to script
  // from response timing either.
  const precheck = await precheckPasswordSignIn(email, password);
  if (precheck.outcome === "unknown_account") {
    redirect(errorUrl("NoSuchAccount", callbackUrl));
  }
  if (precheck.outcome === "no_password") {
    redirect(errorUrl("PasswordNotSet", callbackUrl));
  }
  if (precheck.outcome === "wrong_password") {
    redirect(errorUrl("PasswordWrong", callbackUrl));
  }

  try {
    await signIn("credentials", {
      email,
      password,
      remember,
      redirectTo: callbackUrl,
    });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    signInErrorRedirect({
      code: "Unknown",
      callbackUrl,
      cause: error,
      context: { provider: "credentials", emailDomain: emailDomain(email) },
    });
  }
}

export async function signInWithGoogleAction(callbackUrl: string): Promise<void> {
  try {
    await signIn("google", { redirectTo: callbackUrl });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    signInErrorRedirect({
      code: "OAuthSignin",
      callbackUrl,
      cause: error,
      context: { provider: "google" },
    });
  }
}

export async function signInWithMagicLinkAction(
  callbackUrl: string,
  formData: FormData,
): Promise<void> {
  const rawEmail = String(formData.get("email") ?? "");
  const parsed = SignInEmailSchema.safeParse({ email: rawEmail });
  if (!parsed.success) {
    redirect(errorUrl("InvalidEmail", callbackUrl, "magic"));
  }
  const email = parsed.data.email;
  if (!(await rateLimitSubject(email, "magic::"))) {
    redirect(errorUrl("RateLimited", callbackUrl, "magic"));
  }

  try {
    await signIn("nodemailer", { email, redirectTo: callbackUrl });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    signInErrorRedirect({
      code: "EmailSignin",
      callbackUrl,
      cause: error,
      context: { provider: "nodemailer", emailDomain: emailDomain(email) },
    });
  }
}
