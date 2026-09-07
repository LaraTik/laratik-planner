"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { db } from "@/lib/db";
import { agencyStorageConfigs } from "@/lib/db/schema";
import { testAgencyStorageConnection } from "@/lib/storage/config";

export type AgencyStorageActionState = {
  errorKey?: string;
  successKey?: string;
};

export async function setAgencyStorageEnabledAction(enabled: boolean): Promise<void> {
  const session = await auth();
  const actor = await currentActor();
  if (!session?.user?.id || !actor) return;
  const context = await resolveActiveAgencyContext({ actor });
  if (!context?.agencyId || !(await isAgencyAdmin(actor, context.agencyId))) return;
  await db
    .update(agencyStorageConfigs)
    .set({
      enabled,
      status: enabled ? "pending" : "disabled",
      configuredBy: actor.id,
      updatedAt: new Date(),
    })
    .where(eq(agencyStorageConfigs.agencyId, context.agencyId));
  revalidatePath("/app/agency-settings/storage");
  revalidatePath("/app/agency-settings");
}

export async function testAgencyStorageAction(
  _previous: AgencyStorageActionState,
  _formData: FormData,
): Promise<AgencyStorageActionState> {
  void _previous;
  void _formData;
  const session = await auth();
  const actor = await currentActor();
  if (!session?.user?.id || !actor) return { errorKey: "storage.authRequired" };
  const context = await resolveActiveAgencyContext({ actor });
  if (!context?.agencyId || !(await isAgencyAdmin(actor, context.agencyId))) {
    return { errorKey: "storage.permissionDenied" };
  }

  const result = await testAgencyStorageConnection(context.agencyId);
  revalidatePath("/app/agency-settings/storage");
  revalidatePath("/app/agency-settings");
  return result.ok
    ? { successKey: "storage.healthCheckSuccess" }
    : { errorKey: "storage.healthCheckFailed" };
}
