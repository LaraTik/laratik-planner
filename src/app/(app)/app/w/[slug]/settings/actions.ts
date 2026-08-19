"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import {
  nullableIdFromForm,
  nullableNumberFromForm,
  workspaceSettingsCommandSchema,
} from "@/lib/workspaces/settings-command";
import { updateWorkspaceSettings } from "@/lib/workspaces/settings-service";

export type SettingsActionState = { saved?: boolean; error?: string };

export async function updateWorkspaceSettingsAction(
  slug: string,
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in again to save settings." };
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return { error: "Workspace not found." };
  const parsed = workspaceSettingsCommandSchema.safeParse({
    workspaceId: workspace.id,
    timezone: formData.get("timezone"),
    approvalMode: formData.get("approvalMode"),
    monthlyTarget: nullableNumberFromForm(formData.get("monthlyTarget")),
    contentApprovalLeadDays: Number(formData.get("contentApprovalLeadDays")),
    designCompleteLeadDays: Number(formData.get("designCompleteLeadDays")),
    creativeApprovalLeadDays: Number(formData.get("creativeApprovalLeadDays")),
    readyToPublishLeadDays: Number(formData.get("readyToPublishLeadDays")),
    defaultDesignerId: nullableIdFromForm(formData.get("defaultDesignerId")),
    defaultContentReviewerId: nullableIdFromForm(formData.get("defaultContentReviewerId")),
    defaultInternalCreativeReviewerId: nullableIdFromForm(
      formData.get("defaultInternalCreativeReviewerId"),
    ),
    defaultClientReviewerId: nullableIdFromForm(formData.get("defaultClientReviewerId")),
  });
  if (!parsed.success) return { error: "Check the timezone, target, lead times, and assignees." };
  try {
    await updateWorkspaceSettings({ id: session.user.id }, parsed.data);
  } catch {
    return { error: "Settings could not be saved. Check your access and selected roles." };
  }
  revalidatePath(`/app/w/${slug}`);
  revalidatePath(`/app/w/${slug}/settings`);
  return { saved: true };
}
