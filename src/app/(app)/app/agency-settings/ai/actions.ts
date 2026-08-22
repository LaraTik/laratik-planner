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
