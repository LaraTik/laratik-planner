"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { logError } from "@/lib/observability/logger";
import { saveInstructionPackDraft } from "@/lib/ai/instruction-packs";
import {
  PlanningInstructionPackManifestSchema,
  type PlanningInstructionPackManifest,
} from "@/lib/ai/planning-contract";
import { ZodError } from "zod";

export type PlanningPackActionErrorCode =
  "notSignedIn" | "forbidden" | "invalid" | "notFound" | "saveFailed";
export type PlanningPackActionState = { errorCode?: PlanningPackActionErrorCode; saved?: boolean };

export async function savePlanningPackAction(
  _previous: PlanningPackActionState,
  formData: FormData,
): Promise<PlanningPackActionState> {
  const session = await auth();
  const actor = await currentActor();
  if (!session?.user?.id || !actor) return { errorCode: "notSignedIn" };
  const context = await resolveActiveAgencyContext({ actor });
  if (!context || !(await isAgencyAdmin(actor, context.agencyId)))
    return { errorCode: "forbidden" };
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
    if (error instanceof SyntaxError || error instanceof ZodError) return { errorCode: "invalid" };
    if (error instanceof Error && error.message === "Instruction pack not found.")
      return { errorCode: "notFound" };
    logError("planning_packs.save_failed", { err: error });
    return { errorCode: "saveFailed" };
  }
}
