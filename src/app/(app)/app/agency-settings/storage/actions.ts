"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { db } from "@/lib/db";
import { agencyStorageConfigs } from "@/lib/db/schema";
import {
  saveAgencyOwnedR2Config,
  testAgencyOwnedR2Connection,
  testAgencyStorageConnection,
  switchAgencyToManagedStorage,
} from "@/lib/storage/config";
import { StorageConfigurationError } from "@/lib/storage/r2-adapter";
import { z } from "zod";

export type AgencyStorageActionState = {
  errorKey?: string;
  successKey?: string;
};

function inputFromForm(formData: FormData) {
  return {
    accountId: String(formData.get("accountId") ?? ""),
    endpoint: String(formData.get("endpoint") ?? ""),
    bucket: String(formData.get("bucket") ?? ""),
    accessKeyId: String(formData.get("accessKeyId") ?? ""),
    secretAccessKey: String(formData.get("secretAccessKey") ?? ""),
    storageClass: "standard" as const,
  };
}

function isBackendMigrationRequired(error: unknown): boolean {
  return error instanceof StorageConfigurationError && error.message.includes("storage migration");
}

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

export async function testAgencyOwnedR2Action(
  _previous: AgencyStorageActionState,
  formData: FormData,
): Promise<AgencyStorageActionState> {
  void _previous;
  const session = await auth();
  const actor = await currentActor();
  if (!session?.user?.id || !actor) return { errorKey: "storage.authRequired" };
  const context = await resolveActiveAgencyContext({ actor });
  if (!context?.agencyId || !(await isAgencyAdmin(actor, context.agencyId))) {
    return { errorKey: "storage.permissionDenied" };
  }
  try {
    await testAgencyOwnedR2Connection(inputFromForm(formData));
    return { successKey: "storage.ownedTestSuccess" };
  } catch (error) {
    return {
      errorKey: error instanceof z.ZodError ? "storage.invalidConfiguration" : "storage.testFailed",
    };
  }
}

export async function saveAgencyOwnedR2Action(
  _previous: AgencyStorageActionState,
  formData: FormData,
): Promise<AgencyStorageActionState> {
  void _previous;
  const session = await auth();
  const actor = await currentActor();
  if (!session?.user?.id || !actor) return { errorKey: "storage.authRequired" };
  const context = await resolveActiveAgencyContext({ actor });
  if (!context?.agencyId || !(await isAgencyAdmin(actor, context.agencyId))) {
    return { errorKey: "storage.permissionDenied" };
  }
  try {
    await saveAgencyOwnedR2Config(actor, context.agencyId, inputFromForm(formData));
    revalidatePath("/app/agency-settings/storage");
    revalidatePath("/app/agency-settings");
    return { successKey: "storage.ownedSavedVerified" };
  } catch (error) {
    if (error instanceof z.ZodError) return { errorKey: "storage.invalidConfiguration" };
    if (isBackendMigrationRequired(error)) return { errorKey: "storage.backendMigrationRequired" };
    return { errorKey: "storage.saveFailed" };
  }
}

export async function switchAgencyToManagedStorageAction(): Promise<AgencyStorageActionState> {
  const session = await auth();
  const actor = await currentActor();
  if (!session?.user?.id || !actor) return { errorKey: "storage.authRequired" };
  const context = await resolveActiveAgencyContext({ actor });
  if (!context?.agencyId || !(await isAgencyAdmin(actor, context.agencyId))) {
    return { errorKey: "storage.permissionDenied" };
  }
  try {
    await switchAgencyToManagedStorage(actor, context.agencyId);
    revalidatePath("/app/agency-settings/storage");
    revalidatePath("/app/agency-settings");
    return { successKey: "storage.managedSwitched" };
  } catch (error) {
    if (isBackendMigrationRequired(error)) return { errorKey: "storage.backendMigrationRequired" };
    return { errorKey: "storage.saveFailed" };
  }
}
