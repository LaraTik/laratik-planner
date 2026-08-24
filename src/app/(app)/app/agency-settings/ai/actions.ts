"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { currentActor } from "@/lib/auth/current-actor";
import { serverEnv } from "@/lib/validation/env";
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
  if (!session?.user?.id) throw new Error("Not signed in");
  const actor = await currentActor();
  if (!actor) throw new Error("Not signed in");
  const ctx = await resolveActiveAgencyContext({ actor });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) throw new Error("Agency not configured");
  if (!(await isAgencyAdmin(actor, agencyId))) {
    throw new Error("Only agency admins can change AI settings");
  }
  return { actor, agencyId };
}

export type AiSettingsActionState = {
  error?: string;
  saved?: string;
};

export type ManagedSecretActionState = {
  ok?: boolean;
  error?: string;
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
      return {
        error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      };
    }
    await updateAiFeatureSettings(actor, parsed.data);
    revalidatePath("/app/agency-settings/ai");
    revalidatePath(`/app/w/[slug]/ai-settings`, "page");
    return { saved: "AI settings saved." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function testAiConnectionAction(): Promise<AiSettingsActionState> {
  try {
    const { actor } = await requireAdmin();
    const result = await testAiConnection(actor);
    revalidatePath("/app/agency-settings/ai");
    if (result.ok) {
      return {
        saved:
          result.latencyMs != null ? `Connection OK · ${result.latencyMs} ms` : "Connection OK",
      };
    }
    const reason = serverEnv.AI_FEATURE_ENABLED
      ? "Provider did not return a 2xx response — check the API key and base URL."
      : "AI_FEATURE_ENABLED is false or MINIMAX_API_KEY is not set in the environment.";
    return { error: reason };
  } catch (e) {
    return { error: (e as Error).message };
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
    if (!parsed.success) {
      return {
        error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      };
    }
    const result = await setManagedAiSecret(actor, agencyId, parsed.data);
    return { ok: true, lastFour: result.lastFour };
  } catch (e) {
    if (e instanceof ManagedSecretError) {
      return { error: e.message };
    }
    return { error: e instanceof Error ? e.message : "Could not save the API key." };
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
    if (!parsed.success) {
      return {
        error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      };
    }
    await clearManagedAiSecret(actor, agencyId, parsed.data);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not remove the API key." };
  }
}
