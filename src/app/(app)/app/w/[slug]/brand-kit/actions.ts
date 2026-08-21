"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { brandAssets, brandVoiceRules } from "@/lib/db/schema";
import { BrandAssetCommandSchema, BrandVoiceRuleCommandSchema } from "@/lib/brand/command";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";

/**
 * Brand Kit server actions (STUDIOFLOW_MASTER_PROMPT.md §11.x).
 *
 * Mirror `src/app/(app)/app/w/[slug]/channels/actions.ts`:
 *  - `auth()` → `getAccessibleWorkspace` → `hasWorkspaceRole(['workspace_manager'])`;
 *  - Validate the FormData payload through the Zod command schema;
 *  - Mutate, then `revalidatePath` the page.
 *
 * `createColorAssetAction` and `createVoiceRuleAction` are the
 * `useActionState` form actions; the corresponding `archiveXxxAction`
 * functions take a slug + id and are bound to a per-row `<form>`.
 */

type FormState = { error?: string; success?: boolean };

function readString(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

export async function createColorAssetAction(
  slug: string,
  _previous: unknown,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in is required." };
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return { error: "Workspace not found." };
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"])))
    return { error: "Workspace manager access is required." };

  const parsed = BrandAssetCommandSchema.safeParse({
    kind: "color",
    name: readString(formData, "name"),
    value: { hex: readString(formData, "hex") },
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  if (parsed.data.kind !== "color") return { error: "Check the form." };

  await db.insert(brandAssets).values({
    workspaceId: workspace.id,
    createdBy: session.user.id,
    kind: "color",
    name: parsed.data.name,
    value: parsed.data.value,
  });
  revalidatePath(`/app/w/${slug}/brand-kit`);
  return { success: true };
}

export async function archiveColorAssetAction(slug: string, assetId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return;
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"])))
    return;
  await db
    .update(brandAssets)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(brandAssets.id, assetId), eq(brandAssets.workspaceId, workspace.id)));
  revalidatePath(`/app/w/${slug}/brand-kit`);
}

export async function createVoiceRuleAction(
  slug: string,
  _previous: unknown,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in is required." };
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return { error: "Workspace not found." };
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"])))
    return { error: "Workspace manager access is required." };

  const parsed = BrandVoiceRuleCommandSchema.safeParse({
    ruleType: readString(formData, "ruleType"),
    content: readString(formData, "content"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  await db.insert(brandVoiceRules).values({
    workspaceId: workspace.id,
    createdBy: session.user.id,
    ruleType: parsed.data.ruleType,
    content: parsed.data.content,
    sortOrder: "0",
  });
  revalidatePath(`/app/w/${slug}/brand-kit`);
  return { success: true };
}

export async function archiveVoiceRuleAction(slug: string, ruleId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return;
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"])))
    return;
  // `brand_voice_rules` has no `archivedAt` column (see channels.ts:73)
  // — we hard-delete. Soft-archive support requires a migration in
  // round 3.
  await db
    .delete(brandVoiceRules)
    .where(and(eq(brandVoiceRules.id, ruleId), eq(brandVoiceRules.workspaceId, workspace.id)));
  revalidatePath(`/app/w/${slug}/brand-kit`);
}
