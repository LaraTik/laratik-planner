"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  DEV_SESSION_COOKIE_NAME,
  DEV_SESSION_MAX_AGE_SECONDS,
  signInDevUser,
} from "@/lib/auth/dev-sign-in";
import { serverEnv } from "@/lib/validation/env";

/**
 * Server action for the one-click dev sign-in form.
 *
 * Upserts a user, signs a NextAuth JWT, sets it as the session cookie,
 * then redirects to the callback URL (defaults to /app).
 *
 * The cookie is HttpOnly so it can only be set server-side — this is
 * intentional and matches the real NextAuth flow.
 *
 * Production: the helper short-circuits to "not_available_in_production"
 * before any DB or JWT work happens, and the page itself is dev-gated
 * at the page level too. Belt and braces.
 */
export async function devSignInAction(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  const result = await signInDevUser({
    email: String(formData.get("email") ?? ""),
    ...(name ? { name } : {}),
    role: formData.get("role") === "user" ? "user" : "agency_admin",
  });

  if (!result.ok) {
    // The page is already dev-gated, so this only happens if NODE_ENV
    // flipped between page load and submit. Re-throw so the error
    // surfaces instead of silently failing.
    throw new Error(`Dev sign-in failed: ${result.error}`);
  }

  const cookieStore = await cookies();
  cookieStore.set({
    name: DEV_SESSION_COOKIE_NAME,
    value: result.token,
    httpOnly: true,
    sameSite: "lax",
    secure: serverEnv.NODE_ENV === "production",
    path: "/",
    maxAge: DEV_SESSION_MAX_AGE_SECONDS,
  });

  const rawCallback = String(formData.get("callbackUrl") ?? "/app");
  // Open-redirect guard: only allow same-origin relative paths
  const callbackUrl =
    rawCallback.startsWith("/") && !rawCallback.startsWith("//") ? rawCallback : "/app";
  redirect(callbackUrl);
}
