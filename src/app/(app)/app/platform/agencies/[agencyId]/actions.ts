"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current-actor";
import {
  updateAgencyAsPlatform,
  UpdateAgencySchema,
  AgencyUpdateError,
} from "@/lib/agencies/command";
import { z } from "zod";

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
 * Authorization is enforced again in `updateAgencyAsPlatform`
 * through the exact `platform.agency.update` permission. Platform
 * authority remains separate from agency membership and does not
 * create or require a tenant membership.
 */

async function requirePlatformActor() {
  const actor = await currentActor();
  if (!actor) throw new Error("Not signed in");
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
  const agencyId = z.string().uuid().safeParse(formData.get("agencyId"));
  if (!agencyId.success) return { error: "Missing or invalid agency id." };
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
    const result = await updateAgencyAsPlatform(actor, agencyId.data, parsed.data);
    revalidatePath(`/app/platform/agencies/${agencyId.data}`);
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
