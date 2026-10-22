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
  // Existing configurations intentionally accept a blank secret so an
  // administrator can change the Graph version or Login config without
  // re-pasting the sealed secret. The action resolves the blank value to
  // the already-sealed secret below; new configurations still require one.
  appSecret: z.string().max(500, "App secret is too long."),
  loginConfigId: z.string().trim().max(200, "Login config id is too long.").nullable(),
  graphApiVersion: z
    .string()
    .trim()
    .regex(/^v\d+\.\d+$/, "Graph API version must look like 'v<num>.<num>'.")
    .nullable(),
  enabled: z.boolean(),
});
const SocialProviderSchema = z.enum(["meta", "tiktok"]);

export type ProviderConfigErrorCode =
  | "sign_in_required"
  | "agency_admin_required"
  | "agency_mismatch"
  | "invalid_input"
  | "app_credentials_required"
  | "app_secret_required"
  | "save_failed"
  | "remove_failed"
  | "test_failed";

export type ProviderTestMessageCode =
  | "provider_not_configured"
  | "format_check_passed"
  | "app_id_too_short"
  | "meta_login_config_required"
  | "invalid_graph_api_version";

export type TestResult = { ok: boolean; messageCodes: ProviderTestMessageCode[] };

export type ProviderConfigFormState = {
  errorCode?: ProviderConfigErrorCode;
  saved?: true;
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
  if (!session?.user?.id) return { errorCode: "sign_in_required" };
  const ctx = await requireAgencyAdmin(session.user.id);
  if (!ctx) return { errorCode: "agency_admin_required" };
  if (ctx !== agencyIdFromUrl) return { errorCode: "agency_mismatch" };
  const parsedProvider = SocialProviderSchema.safeParse(provider);
  if (!parsedProvider.success) return { errorCode: "invalid_input" };
  const parsed = ProviderConfigSchema.safeParse(input);
  if (!parsed.success) return { errorCode: "invalid_input" };
  try {
    const existing = await getAgencyProviderConfig(db, ctx, parsedProvider.data);
    const appSecret =
      parsed.data.appSecret.trim() || ("appId" in existing ? existing.appSecret : "");
    if (!appSecret) return { errorCode: "app_secret_required" };
    await setAgencyProviderConfig(db, {
      agencyId: ctx,
      provider: parsedProvider.data,
      appId: parsed.data.appId,
      appSecret,
      loginConfigId: parsed.data.loginConfigId ?? null,
      graphApiVersion: parsed.data.graphApiVersion ?? null,
      enabled: parsed.data.enabled,
      actorId: session.user.id,
    });
    revalidatePath("/app/agency-settings/social/providers");
    return { saved: true };
  } catch {
    return { errorCode: "save_failed" };
  }
}

export async function removeProviderConfigAction(
  agencyIdFromUrl: string,
  provider: SocialProvider,
): Promise<ProviderConfigFormState> {
  const session = await auth();
  if (!session?.user?.id) return { errorCode: "sign_in_required" };
  const ctx = await requireAgencyAdmin(session.user.id);
  if (!ctx) return { errorCode: "agency_admin_required" };
  if (ctx !== agencyIdFromUrl) return { errorCode: "agency_mismatch" };
  const parsedProvider = SocialProviderSchema.safeParse(provider);
  if (!parsedProvider.success) return { errorCode: "invalid_input" };
  try {
    await removeAgencyProviderConfig(db, ctx, parsedProvider.data);
    revalidatePath("/app/agency-settings/social/providers");
    return { saved: true };
  } catch {
    return { errorCode: "remove_failed" };
  }
}

export async function testProviderConfigAction(
  agencyIdFromUrl: string,
  provider: SocialProvider,
): Promise<ProviderConfigFormState> {
  const session = await auth();
  if (!session?.user?.id) return { errorCode: "sign_in_required" };
  const ctx = await requireAgencyAdmin(session.user.id);
  if (!ctx) return { errorCode: "agency_admin_required" };
  if (ctx !== agencyIdFromUrl) return { errorCode: "agency_mismatch" };
  const parsedProvider = SocialProviderSchema.safeParse(provider);
  if (!parsedProvider.success) return { errorCode: "invalid_input" };
  try {
    const config = await getAgencyProviderConfig(db, ctx, parsedProvider.data);
    if (!("appId" in config)) {
      return { testResult: { ok: false, messageCodes: ["provider_not_configured"] } };
    }
    // This is a format check only. A live provider check happens on the
    // channels page; TikTok's Login Kit config id is intentionally optional.
    const messageCodes: ProviderTestMessageCode[] = [];
    if (!config.appId || config.appId.length < 4) messageCodes.push("app_id_too_short");
    if (parsedProvider.data === "meta" && !config.loginConfigId) {
      messageCodes.push("meta_login_config_required");
    }
    if (config.graphApiVersion && !/^v\d+\.\d+$/.test(config.graphApiVersion)) {
      messageCodes.push("invalid_graph_api_version");
    }
    const ok = messageCodes.length === 0;
    if (ok) messageCodes.push("format_check_passed");
    await recordProviderTestResult(db, ctx, parsedProvider.data, {
      ok,
      errorCode: ok ? null : "format_check_failed",
    });
    revalidatePath("/app/agency-settings/social/providers");
    return { testResult: { ok, messageCodes } };
  } catch {
    return { errorCode: "test_failed" };
  }
}

// Re-export the existence check for the page.
export { hasAgencyProviderConfig };
