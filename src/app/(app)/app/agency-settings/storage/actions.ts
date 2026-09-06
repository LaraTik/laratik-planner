"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { db } from "@/lib/db";
import { agencyStorageConfigs } from "@/lib/db/schema";

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
}
