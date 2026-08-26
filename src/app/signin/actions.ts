"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/lib/auth/config";
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

  if (!parsed.success || !password) {
    redirect(errorUrl("InvalidEmail", callbackUrl));
  }
  const email = parsed.data.email;
  if (!(await rateLimitSubject(email))) {
    redirect(errorUrl("RateLimited", callbackUrl));
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
