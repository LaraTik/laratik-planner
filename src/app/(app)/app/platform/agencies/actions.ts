"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentActor } from "@/lib/auth/current-actor";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { changeAgencyPlan, OverrideShapeSchema } from "@/lib/entitlements";
import {
  AgencyLifecycleActionSchema,
  changeAgencyLifecycle,
  createAgency,
  CreateAgencySchema,
} from "@/lib/platform/agencies";

export type PlatformActionState = {
  success?: boolean;
  error?: string;
  warning?: string;
  agencyId?: string;
};

function overridesFromForm(formData: FormData) {
  if (formData.get("overrideForm") === "1") {
    const numericKeys = [
      "workspaces",
      "users",
      "total_social_profiles",
      "storage_bytes",
      "monthly_ai_requests",
      "monthly_ai_input_tokens",
      "monthly_ai_output_tokens",
      "daily_ai_requests_per_user",
      "max_output_tokens_per_request",
    ] as const;
    const numeric = Object.fromEntries(
      numericKeys.flatMap((key) => {
        const value = formData.get(`override_${key}`);
        return typeof value === "string" && value.trim() !== ""
          ? [[key, z.coerce.number().int().nonnegative().parse(value)]]
          : [];
      }),
    );
    const platforms = [
      "instagram",
      "facebook",
      "tiktok",
      "linkedin",
      "youtube",
      "pinterest",
      "x",
      "threads",
      "snapchat",
      "other",
    ] as const;
    const byPlatform = Object.fromEntries(
      platforms.flatMap((platform) => {
        const value = formData.get(`override_social_${platform}`);
        return typeof value === "string" && value.trim() !== ""
          ? [[platform, z.coerce.number().int().nonnegative().parse(value)]]
          : [];
      }),
    );
    return OverrideShapeSchema.parse({
      ...numeric,
      ...(Object.keys(byPlatform).length > 0 ? { social_profiles_by_platform: byPlatform } : {}),
      enabled_capabilities: formData
        .getAll("override_enabled_capabilities")
        .filter((value): value is string => typeof value === "string"),
    });
  }
  const raw = formData.get("overrides");
  if (typeof raw !== "string" || !raw.trim()) return {};
  return OverrideShapeSchema.parse(JSON.parse(raw));
}

export async function createAgencyAction(
  _previous: PlatformActionState,
  formData: FormData,
): Promise<PlatformActionState> {
  const actor = await currentActor();
  if (!actor) return { error: "Sign in is required." };
  try {
    const input = CreateAgencySchema.parse({
      name: formData.get("name"),
      slug: formData.get("slug"),
      locale: formData.get("locale") || "en",
      timezone: formData.get("timezone") || "UTC",
      adminEmail: formData.get("adminEmail"),
      adminName: formData.get("adminName"),
      planTemplateId: formData.get("planTemplateId"),
      overrides: overridesFromForm(formData),
      reason: formData.get("reason") || "Initial agency provisioning",
    });
    const result = await createAgency(actor, input);
    revalidatePath("/app/platform/agencies");
    return {
      success: true,
      agencyId: result.id,
      ...(result.emailSent
        ? {}
        : { warning: "Agency created, but the administrator email could not be sent." }),
    };
  } catch (error) {
    console.error("[createAgencyAction] failed", error);
    return {
      error:
        error instanceof z.ZodError
          ? (error.issues[0]?.message ?? "Check the agency details.")
          : error instanceof Error
            ? error.message
            : "The agency could not be created.",
    };
  }
}

export async function changeLifecycleAction(formData: FormData): Promise<void> {
  const actor = await currentActor();
  if (!actor) throw new Error("Sign in is required");
  await requirePlatformAdmin(actor);
  const input = AgencyLifecycleActionSchema.parse({
    agencyId: formData.get("agencyId"),
    action: formData.get("action"),
    reason: formData.get("reason"),
  });
  await changeAgencyLifecycle(actor, input);
  revalidatePath(`/app/platform/agencies/${input.agencyId}`);
  revalidatePath("/app/platform/agencies");
}

export async function changePlanAction(formData: FormData): Promise<void> {
  const actor = await currentActor();
  if (!actor) throw new Error("Sign in is required");
  await requirePlatformAdmin(actor);
  const agencyId = z.string().uuid().parse(formData.get("agencyId"));
  await changeAgencyPlan({
    agencyId,
    planTemplateId: z.string().uuid().parse(formData.get("planTemplateId")),
    overrides: overridesFromForm(formData),
    reason: z.string().trim().min(3).max(500).parse(formData.get("reason")),
    actorUserId: actor.id,
  });
  revalidatePath(`/app/platform/agencies/${agencyId}`);
  revalidatePath("/app/agency-settings/plan");
}
