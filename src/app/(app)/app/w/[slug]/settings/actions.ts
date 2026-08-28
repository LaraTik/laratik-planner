"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import {
  workspaces as workspacesTable,
  workspaceSettings as workspaceSettingsTable,
} from "@/lib/db/schema/workspaces";
import { humanize } from "@/lib/content/status";
import {
  nullableIdFromForm,
  nullableNumberFromForm,
  workspaceSettingsCommandSchema,
} from "@/lib/workspaces/settings-command";
import { updateWorkspaceSettings } from "@/lib/workspaces/settings-service";

export type SettingsActionState = { saved?: boolean; error?: string };

/**
 * Single combined action — kept for any consumer that still
 * posts the old single-form payload (none in the per-section
 * Phase A refactor; the per-section forms below are the new
 * entry points). The old `SettingsForm` component was deleted
 * in this phase; the per-section pages each call their own
 * action.
 */
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

// ─── Per-section actions (Settings Phase A) ───────────────────────────────
//
// Each per-section form posts only the fields it owns. The
// underlying DB row is still the same `workspace_settings` row
// (master prompt §17 — "data is one row"). The actions do a
// partial update so a save on the lead-times page doesn't
// clobber a concurrent edit on the defaults page. The timezone
// lives on the `workspaces` table (master prompt §8), so the
// Lifecycle action updates both tables.

async function authedWorkspace(
  slug: string,
): Promise<{ ok: true; workspaceId: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Sign in again to save settings." };
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return { ok: false, error: "Workspace not found." };
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"]))) {
    return { ok: false, error: "Workspace manager access is required." };
  }
  return { ok: true, workspaceId: workspace.id };
}

export async function updateLifecycleSettingsAction(
  slug: string,
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const auth = await authedWorkspace(slug);
  if (!auth.ok) return { error: auth.error };

  const timezone = String(formData.get("timezone") ?? "").trim();
  if (!timezone) return { error: "Timezone is required." };
  let ok: boolean;
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    ok = true;
  } catch {
    ok = false;
  }
  if (!ok) return { error: "Unknown timezone." };

  const monthlyTarget = nullableNumberFromForm(formData.get("monthlyTarget"));
  if (monthlyTarget !== null && (monthlyTarget < 1 || monthlyTarget > 10_000)) {
    return { error: "Monthly target must be between 1 and 10,000." };
  }

  try {
    // Timezone lives on the workspaces table; monthlyTarget lives on
    // workspace_settings. The Lifecycle action owns both fields.
    await db.transaction(async (tx) => {
      await tx
        .update(workspacesTable)
        .set({ timezone, updatedAt: new Date() })
        .where(eq(workspacesTable.id, auth.workspaceId));
      await tx
        .update(workspaceSettingsTable)
        .set({ monthlyTarget, updatedAt: new Date() })
        .where(eq(workspaceSettingsTable.workspaceId, auth.workspaceId));
    });
  } catch {
    return { error: "Settings could not be saved." };
  }
  revalidatePath(`/app/w/${slug}/settings`);
  revalidatePath(`/app/w/${slug}/settings/lifecycle`);
  return { saved: true };
}

export async function updateLeadTimesSettingsAction(
  slug: string,
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const auth = await authedWorkspace(slug);
  if (!auth.ok) return { error: auth.error };

  const next = {
    contentApprovalLeadDays: clampLeadDays(formData.get("contentApprovalLeadDays")),
    designCompleteLeadDays: clampLeadDays(formData.get("designCompleteLeadDays")),
    creativeApprovalLeadDays: clampLeadDays(formData.get("creativeApprovalLeadDays")),
    readyToPublishLeadDays: clampLeadDays(formData.get("readyToPublishLeadDays")),
  };
  try {
    await db
      .update(workspaceSettingsTable)
      .set({ ...next, updatedAt: new Date() })
      .where(eq(workspaceSettingsTable.workspaceId, auth.workspaceId));
  } catch {
    return { error: "Settings could not be saved." };
  }
  revalidatePath(`/app/w/${slug}/settings`);
  revalidatePath(`/app/w/${slug}/settings/lead-times`);
  return { saved: true };
}

export async function updateDefaultsSettingsAction(
  slug: string,
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const auth = await authedWorkspace(slug);
  if (!auth.ok) return { error: auth.error };

  const next = {
    defaultDesignerId: nullableIdFromForm(formData.get("defaultDesignerId")),
    defaultContentReviewerId: nullableIdFromForm(formData.get("defaultContentReviewerId")),
    defaultInternalCreativeReviewerId: nullableIdFromForm(
      formData.get("defaultInternalCreativeReviewerId"),
    ),
    defaultClientReviewerId: nullableIdFromForm(formData.get("defaultClientReviewerId")),
  };
  try {
    await db
      .update(workspaceSettingsTable)
      .set({ ...next, updatedAt: new Date() })
      .where(eq(workspaceSettingsTable.workspaceId, auth.workspaceId));
  } catch {
    return { error: "Settings could not be saved." };
  }
  revalidatePath(`/app/w/${slug}/settings`);
  revalidatePath(`/app/w/${slug}/settings/defaults`);
  return { saved: true };
}

export async function updateApprovalsSettingsAction(
  slug: string,
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const auth = await authedWorkspace(slug);
  if (!auth.ok) return { error: auth.error };

  const raw = String(formData.get("approvalMode") ?? "");
  if (raw !== "simple" && raw !== "internal_then_client") {
    return { error: "Pick an approval mode." };
  }
  try {
    await db
      .update(workspaceSettingsTable)
      .set({ approvalMode: raw, updatedAt: new Date() })
      .where(eq(workspaceSettingsTable.workspaceId, auth.workspaceId));
  } catch {
    return { error: "Settings could not be saved." };
  }
  revalidatePath(`/app/w/${slug}/settings`);
  revalidatePath(`/app/w/${slug}/settings/approvals`);
  return { saved: true };
}

function clampLeadDays(value: FormDataEntryValue | null): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 90) return 90;
  return Math.round(n);
}

void humanize;
