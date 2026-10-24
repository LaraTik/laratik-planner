"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current-actor";
import { PermissionDeniedError } from "@/lib/auth/policy";
import { logError } from "@/lib/observability/logger";
import type { PlatformRole } from "@/lib/auth/platform-access-types";
import {
  changePlatformRole,
  ChangePlatformRoleSchema,
  grantPlatformAccess,
  GrantPlatformAccessSchema,
  PlatformAccessServiceError,
  revokePlatformAccess,
  RevokePlatformAccessSchema,
} from "@/lib/platform/access";

export type PlatformAccessActionState = Readonly<{
  ok?: boolean;
  error?: string;
  code?: string;
  errorCode?: "unexpected_failure";
  email?: string;
  role?: PlatformRole;
  unchanged?: boolean;
}>;

async function actorOrNull() {
  return currentActor();
}

function validationError(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>) {
  return issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
}

function actionError(error: unknown, event: string): PlatformAccessActionState {
  if (error instanceof PlatformAccessServiceError) {
    return { error: error.message, code: error.code };
  }
  if (error instanceof PermissionDeniedError) {
    return { error: "You do not have permission to change platform access." };
  }
  logError(event, { err: error });
  return { errorCode: "unexpected_failure" };
}

export async function grantPlatformAccessAction(
  _previous: PlatformAccessActionState,
  formData: FormData,
): Promise<PlatformAccessActionState> {
  const actor = await actorOrNull();
  if (!actor) return { error: "Sign in is required." };
  const parsed = GrantPlatformAccessSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: validationError(parsed.error.issues) };
  try {
    const result = await grantPlatformAccess(actor, parsed.data);
    revalidatePath("/app/platform/access");
    return {
      ok: true,
      email: parsed.data.email,
      role: result.role,
      unchanged: result.unchanged,
    };
  } catch (error) {
    return actionError(error, "platform_access.grant_failed");
  }
}

export async function changePlatformRoleAction(
  _previous: PlatformAccessActionState,
  formData: FormData,
): Promise<PlatformAccessActionState> {
  const actor = await actorOrNull();
  if (!actor) return { error: "Sign in is required." };
  const parsed = ChangePlatformRoleSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: validationError(parsed.error.issues) };
  try {
    const result = await changePlatformRole(actor, parsed.data);
    revalidatePath("/app/platform/access");
    return { ok: true, role: result.role, unchanged: result.unchanged };
  } catch (error) {
    return actionError(error, "platform_access.role_change_failed");
  }
}

export async function revokePlatformAccessAction(
  _previous: PlatformAccessActionState,
  formData: FormData,
): Promise<PlatformAccessActionState> {
  const actor = await actorOrNull();
  if (!actor) return { error: "Sign in is required." };
  const parsed = RevokePlatformAccessSchema.safeParse({
    userId: formData.get("userId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: validationError(parsed.error.issues) };
  try {
    const result = await revokePlatformAccess(actor, parsed.data);
    revalidatePath("/app/platform/access");
    return { ok: true, role: result.role, unchanged: result.unchanged };
  } catch (error) {
    return actionError(error, "platform_access.revoke_failed");
  }
}
