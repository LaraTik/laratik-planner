"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { currentActor } from "@/lib/auth/current-actor";
import {
  AI_CAPABILITIES,
  UpdateAiSettingsSchema,
  testAiConnection,
  updateAiFeatureSettings,
} from "@/lib/ai/feature-settings";
import {
  setManagedAiSecret,
  clearManagedAiSecret,
  ManagedSecretError,
  SetManagedAiSecretSchema,
  ClearManagedAiSecretSchema,
} from "@/lib/ai/provider-secret";

/**
 * Server actions for the agency-level AI configuration page.
 *
 * The schema is the source of truth; these actions translate a
 * <form action> FormData payload into a typed input for the service.
 */

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) throw new AiSettingsAuthorizationError();
  const actor = await currentActor();
  if (!actor) throw new AiSettingsAuthorizationError();
  const ctx = await resolveActiveAgencyContext({ actor });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId || !(await isAgencyAdmin(actor, agencyId)))
    throw new AiSettingsAuthorizationError();
  return { actor, agencyId };
}

class AiSettingsAuthorizationError extends Error {
  constructor() {
    super("AI settings action is unauthorized");
    this.name = "AiSettingsAuthorizationError";
  }
}

export type AiSettingsActionErrorCode =
  "unauthorized" | "invalid_input" | "save_failed" | "connection_failed";

export type AiSettingsActionState = {
  errorCode?: AiSettingsActionErrorCode;
  savedCode?: "saved" | "connection_ok";
  latencyMs?: number;
};

export type ManagedSecretActionErrorCode =
  "unauthorized" | "invalid_input" | "missing_encryption_key" | "save_failed" | "remove_failed";

export type ManagedSecretActionState = {
  ok?: boolean;
  errorCode?: ManagedSecretActionErrorCode;
  lastFour?: string;
};

export async function saveAiSettingsAction(
  _prev: AiSettingsActionState,
  formData: FormData,
): Promise<AiSettingsActionState> {
  try {
    const { actor } = await requireAdmin();
    const enabled = formData.get("enabled") === "on";
    const model = String(formData.get("model") ?? "").trim();
    const enabledCapabilities = AI_CAPABILITIES.filter((c) => formData.get(`cap_${c}`) === "on");
    const parsed = UpdateAiSettingsSchema.safeParse({ enabled, model, enabledCapabilities });
    if (!parsed.success) {
      return { errorCode: "invalid_input" };
    }
    await updateAiFeatureSettings(actor, parsed.data);
    revalidatePath("/app/agency-settings/ai");
    return { savedCode: "saved" };
  } catch (error) {
    return {
      errorCode: error instanceof AiSettingsAuthorizationError ? "unauthorized" : "save_failed",
    };
  }
}

export async function testAiConnectionAction(): Promise<AiSettingsActionState> {
  try {
    const { actor } = await requireAdmin();
    const result = await testAiConnection(actor);
    revalidatePath("/app/agency-settings/ai");
    if (!result.ok) return { errorCode: "connection_failed" };
    return result.latencyMs == null
      ? { savedCode: "connection_ok" }
      : { savedCode: "connection_ok", latencyMs: result.latencyMs };
  } catch (error) {
    return {
      errorCode:
        error instanceof AiSettingsAuthorizationError ? "unauthorized" : "connection_failed",
    };
  }
}

export async function setManagedAiSecretAction(
  _prev: ManagedSecretActionState,
  formData: FormData,
): Promise<ManagedSecretActionState> {
  try {
    const { actor, agencyId } = await requireAdmin();
    const parsed = SetManagedAiSecretSchema.safeParse({
      apiKey: formData.get("apiKey"),
    });
    if (!parsed.success) return { errorCode: "invalid_input" };
    const result = await setManagedAiSecret(actor, agencyId, parsed.data);
    return { ok: true, lastFour: result.lastFour };
  } catch (e) {
    if (e instanceof AiSettingsAuthorizationError) return { errorCode: "unauthorized" };
    if (e instanceof ManagedSecretError && e.code === "managed_secret.missing-key") {
      return { errorCode: "missing_encryption_key" };
    }
    return { errorCode: "save_failed" };
  }
}

export async function clearManagedAiSecretAction(
  _prev: ManagedSecretActionState,
  formData: FormData,
): Promise<ManagedSecretActionState> {
  try {
    const { actor, agencyId } = await requireAdmin();
    const parsed = ClearManagedAiSecretSchema.safeParse({
      reason: formData.get("reason"),
    });
    if (!parsed.success) return { errorCode: "invalid_input" };
    await clearManagedAiSecret(actor, agencyId, parsed.data);
    return { ok: true };
  } catch (error) {
    return {
      errorCode: error instanceof AiSettingsAuthorizationError ? "unauthorized" : "remove_failed",
    };
  }
}
