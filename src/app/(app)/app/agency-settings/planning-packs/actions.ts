"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { saveInstructionPackDraft } from "@/lib/ai/instruction-packs";
import {
  PlanningInstructionPackManifestSchema,
  type PlanningInstructionPackManifest,
} from "@/lib/ai/planning-contract";

export type PlanningPackActionState = { error?: string; saved?: boolean };

export async function savePlanningPackAction(
  _previous: PlanningPackActionState,
  formData: FormData,
): Promise<PlanningPackActionState> {
  const session = await auth();
  const actor = await currentActor();
  if (!session?.user?.id || !actor) return { error: "Not signed in." };
  const context = await resolveActiveAgencyContext({ actor });
  if (!context || !(await isAgencyAdmin(actor, context.agencyId)))
    return { error: "Only agency admins can edit planning packs." };
  try {
    const rawManifest = String(formData.get("manifest") ?? "");
    await saveInstructionPackDraft(actor, context.agencyId, null, {
      ...(String(formData.get("id") ?? "") ? { id: String(formData.get("id")) } : {}),
      name: String(formData.get("name") ?? ""),
      sourceMarkdown: String(formData.get("sourceMarkdown") ?? ""),
      manifest: PlanningInstructionPackManifestSchema.parse(
        JSON.parse(rawManifest) as unknown,
      ) as PlanningInstructionPackManifest,
    });
    revalidatePath("/app/agency-settings/planning-packs");
    return { saved: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "The planning pack could not be saved.",
    };
  }
}
