"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { db } from "@/lib/db";
import {
  getAgencyProviderConfig,
  recordProviderTestResult,
  removeAgencyProviderConfig,
  setAgencyProviderConfig,
  type SocialProvider,
} from "@/lib/social/provider-config";
import { hasAgencyProviderConfig } from "@/lib/social/provider-config";

/**
 * M4.6 — agency-admin server actions for the per-provider config.
 *
 * Each action:
 *   1. Authenticates the actor and asserts `isAgencyAdmin` on the
 *      resolved agency (the agency context's agency, not a
 *      workspace).
 *   2. Validates the input with the shared Zod schema below.
 *   3. Calls the service helper and returns a uniform
 *      `{ success, testResult } | { error, errorCode }` shape.
 *   4. `revalidatePath` on success so the channels page picks up
 *      the new "Connect Meta" card.
 *
 * The test endpoint exists as a separate route
 * (`/api/social/providers/test`) because it needs to make a
 * network call to Meta / TikTok and benefits from the dedicated
 * 30s timeout.
 */

const ProviderConfigSchema = z.object({
  appId: z.string().trim().min(1, "App id is required.").max(200, "App id is too long."),
  appSecret: z.string().min(1, "App secret is required.").max(500, "App secret is too long."),
  loginConfigId: z.string().trim().max(200, "Login config id is too long.").nullable(),
  graphApiVersion: z
    .string()
    .trim()
    .regex(/^v\d+\.\d+$/, "Graph API version must look like 'v<num>.<num>'.")
    .nullable(),
  enabled: z.boolean(),
});

export type TestResult = { ok: true; message: string } | { ok: false; message: string };

export type ProviderConfigFormState = {
  error?: string;
  errorCode?: string;
  success?: true;
  testResult?: TestResult;
};

export type ProviderConfigInput = z.input<typeof ProviderConfigSchema>;

async function requireAgencyAdmin(actorId: string): Promise<string | null> {
  const ctx = await resolveActiveAgencyContext({ actor: { id: actorId } });
  if (!ctx) return null;
  if (!(await isAgencyAdmin({ id: actorId }, ctx.agencyId))) return null;
  return ctx.agencyId;
}

export async function setProviderConfigAction(
  agencyIdFromUrl: string,
  actorId: string,
  provider: SocialProvider,
  input: ProviderConfigInput,
): Promise<ProviderConfigFormState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in is required." };
  const ctx = await requireAgencyAdmin(session.user.id);
  if (!ctx) return { error: "Agency admin access is required." };
  if (ctx !== agencyIdFromUrl) return { error: "Agency mismatch." };
  const parsed = ProviderConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form input." };
  }
  try {
    await setAgencyProviderConfig(db, {
      agencyId: ctx,
      provider,
      appId: parsed.data.appId,
      appSecret: parsed.data.appSecret,
      loginConfigId: parsed.data.loginConfigId ?? null,
      graphApiVersion: parsed.data.graphApiVersion ?? null,
      enabled: parsed.data.enabled,
      actorId: session.user.id,
    });
    revalidatePath("/app/agency-settings/social/providers");
    revalidatePath(`/app/w/[slug]/channels`, "page");
    return { success: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to save provider config.",
    };
  }
}

export async function removeProviderConfigAction(
  agencyIdFromUrl: string,
  provider: SocialProvider,
): Promise<ProviderConfigFormState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in is required." };
  const ctx = await requireAgencyAdmin(session.user.id);
  if (!ctx) return { error: "Agency admin access is required." };
  if (ctx !== agencyIdFromUrl) return { error: "Agency mismatch." };
  try {
    await removeAgencyProviderConfig(db, ctx, provider);
    revalidatePath("/app/agency-settings/social/providers");
    revalidatePath(`/app/w/[slug]/channels`, "page");
    return { success: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to remove provider config.",
    };
  }
}

export async function testProviderConfigAction(
  agencyIdFromUrl: string,
  provider: SocialProvider,
): Promise<ProviderConfigFormState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in is required." };
  const ctx = await requireAgencyAdmin(session.user.id);
  if (!ctx) return { error: "Agency admin access is required." };
  if (ctx !== agencyIdFromUrl) return { error: "Agency mismatch." };
  const config = await getAgencyProviderConfig(db, ctx, provider);
  if (!("appId" in config)) {
    return {
      success: true,
      testResult: { ok: false, message: "Provider is not configured yet." },
    };
  }
  // Format validation only — the live end-to-end test is the
  // Re-test button on the channels page, which round-trips a real
  // snapshot call. The agency-settings "Test" button is the
  // "did I paste something coherent?" check.
  const messages: string[] = [];
  if (!config.appId || config.appId.length < 4) {
    messages.push("App id looks too short.");
  }
  if (provider === "meta" && !config.loginConfigId) {
    messages.push("Login for Business config id is required for Meta.");
  }
  if (provider === "tiktok" && !config.loginConfigId) {
    messages.push("TikTok client key looks too short.");
  }
  if (config.graphApiVersion && !/^v\d+\.\d+$/.test(config.graphApiVersion)) {
    messages.push("Graph API version must look like 'v<num>.<num>'.");
  }
  const ok = messages.length === 0;
  await recordProviderTestResult(db, ctx, provider, {
    ok,
    errorCode: ok ? null : "format_check_failed",
  });
  revalidatePath("/app/agency-settings/social/providers");
  return {
    success: true,
    testResult: {
      ok,
      message: ok
        ? "Format check passed. The Re-test button on a connected channel runs the live provider check."
        : messages.join(" "),
    },
  };
}

// Re-export the existence check for the page.
export { hasAgencyProviderConfig };
