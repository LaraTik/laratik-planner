"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { currentActor } from "@/lib/auth/current-actor";
import { updateAgency, UpdateAgencySchema, AgencyUpdateError } from "@/lib/agencies/command";

/**
 * Server action for editing the agency identity.
 *
 * The non-admin / non-signed-in paths return a friendly error.
 * The service-layer `updateAgency` enforces the policy; this
 * file maps service errors to UI-friendly strings and reuses
 * `revalidatePath` to refresh the dependent surfaces.
 */

const AgencySessionError = "agency.session-required";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error(AgencySessionError);
  }
  const actor = await currentActor();
  if (!actor) throw new Error(AgencySessionError);
  const ctx = await resolveActiveAgencyContext({ actor });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) throw new Error("Agency not configured");
  if (!(await isAgencyAdmin(actor, agencyId))) {
    throw new Error("Only agency admins can edit agency settings");
  }
  return { actor, agencyId };
}

export type EditAgencyActionState = {
  ok?: boolean;
  error?: string;
  code?: string;
  changedFields?: string[];
};

export async function editAgencyAction(
  _prev: EditAgencyActionState,
  formData: FormData,
): Promise<EditAgencyActionState> {
  const { actor, agencyId } = await requireAdmin();
  const parsed = UpdateAgencySchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    locale: formData.get("locale"),
    timezone: formData.get("timezone"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  }
  try {
    const result = await updateAgency(actor, agencyId, parsed.data);
    revalidatePath("/app/agency-settings");
    revalidatePath(`/app/platform/agencies/${agencyId}`);
    return { ok: true, changedFields: result.changedFields };
  } catch (e) {
    if (e instanceof AgencyUpdateError) {
      return { error: e.message, code: e.code };
    }
    if (e instanceof Error) {
      return { error: e.message };
    }
    return { error: "Could not save the agency settings." };
  }
}
