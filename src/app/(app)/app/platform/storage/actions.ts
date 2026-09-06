"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentActor } from "@/lib/auth/current-actor";
import { requirePlatformPermission } from "@/lib/auth/platform-access";
import { saveManagedR2Config, testR2Connection } from "@/lib/storage/config";

export type StorageConfigActionState = { errorKey?: string; successKey?: string };

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

export async function testManagedR2Action(
  _previous: StorageConfigActionState,
  formData: FormData,
): Promise<StorageConfigActionState> {
  const actor = await currentActor();
  if (!actor) return { errorKey: "storage.authRequired" };
  try {
    await requirePlatformPermission(actor, "platform.console.manage");
    await testR2Connection(inputFromForm(formData));
    return { successKey: "storage.testSuccess" };
  } catch {
    return { errorKey: "storage.testFailed" };
  }
}

export async function saveManagedR2Action(
  _previous: StorageConfigActionState,
  formData: FormData,
): Promise<StorageConfigActionState> {
  const actor = await currentActor();
  if (!actor) return { errorKey: "storage.authRequired" };
  try {
    await saveManagedR2Config(actor, inputFromForm(formData));
    revalidatePath("/app/platform/storage");
    return { successKey: "storage.savedVerified" };
  } catch (error) {
    if (error instanceof z.ZodError) return { errorKey: "storage.invalidConfiguration" };
    return { errorKey: "storage.saveFailed" };
  }
}
