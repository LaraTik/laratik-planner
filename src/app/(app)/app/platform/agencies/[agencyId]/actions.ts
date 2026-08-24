"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { updateAgency, UpdateAgencySchema, AgencyUpdateError } from "@/lib/agencies/command";

/**
 * Platform admin: edit-agency server action.
 *
 * The platform admin is the "superadmin who controls agencies
 * (not their workspaces)" — see docs/agency-setup.md. They
 * can rename any agency, change its slug, or update its
 * locale / timezone. The `updateAgency` service enforces the
 * isAgencyAdmin policy; for a platform admin to call it, the
 * platform admin must also be a member of the agency (or hold
 * an active support-access grant that the platform console
 * surfaces as a tenant view).
 *
 * Authorization: `requirePlatformAdmin(actor)` gates the
 * action; the service-layer `isAgencyAdmin` check is the
 * second layer. A platform admin who is NOT a member of the
 * agency and does NOT hold a grant cannot rename it from this
 * surface.
 */

async function requirePlatformActor() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Not signed in");
  }
  const actor = await currentActor();
  if (!actor) throw new Error("Not signed in");
  await requirePlatformAdmin(actor);
  return actor;
}

export type PlatformEditAgencyActionState = {
  ok?: boolean;
  error?: string;
  code?: string;
  changedFields?: string[];
};

export async function platformEditAgencyAction(
  _prev: PlatformEditAgencyActionState,
  formData: FormData,
): Promise<PlatformEditAgencyActionState> {
  const actor = await requirePlatformActor();
  const agencyId = String(formData.get("agencyId") ?? "");
  if (!agencyId) {
    return { error: "Missing agency id." };
  }
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
    revalidatePath(`/app/platform/agencies/${agencyId}`);
    revalidatePath("/app/agency-settings");
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
