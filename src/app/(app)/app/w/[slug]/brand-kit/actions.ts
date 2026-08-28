"use server";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { aiFeatureSettings, brandAssets, brandVoiceRules } from "@/lib/db/schema";
import {
  BrandAssetCommandSchema,
  BrandLinkedResourceCommandSchema,
  BrandPublishingRuleCommandSchema,
  BrandVoiceRuleCommandSchema,
} from "@/lib/brand/command";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import {
  createColorAsset,
  createFontAsset,
  createLogoAsset,
  archiveBrandLinkedResource,
  archiveBrandPublishingRule,
  createBrandLinkedResource,
  createBrandPublishingRule,
  archiveBrandVoiceRule,
  restoreBrandAsset,
  restoreBrandVoiceRule,
  restoreBrandPublishingRule,
  restoreBrandLinkedResource,
} from "@/lib/brand/service";
import {
  createPillar,
  archivePillar,
  restorePillar,
  CreatePillarSchema,
} from "@/lib/planning/pillars";
import { suggestVoiceRules } from "@/lib/ai";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { getActiveApiKey } from "@/lib/ai";
import { hasAnyManagedSecretConfigured } from "@/lib/ai/provider-secret";

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
    // Phase 8 — optional color role. The form posts the raw
    // string; the Zod command schema narrows it to the enum and
    // a malformed value is rejected with a user-friendly error.
    colorRole: readString(formData, "colorRole") || undefined,
    value: { hex: readString(formData, "hex") },
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  if (parsed.data.kind !== "color") return { error: "Check the form." };

  // Round 5 (rebuild): route through the typed service wrapper so
  // the action does not call db.insert directly. Keeps the authz
  // check in one place and lets tests stub the service.
  const hex = parsed.data.value.hex;
  await createColorAsset({ id: session.user.id }, workspace.id, {
    name: parsed.data.name,
    hex,
    colorRole: parsed.data.colorRole,
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

export async function createLogoAssetAction(
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

  const name = readString(formData, "name");
  const externalUrl = readString(formData, "externalUrl") || undefined;
  const storagePath = readString(formData, "storagePath") || undefined;

  const parsed = BrandAssetCommandSchema.safeParse({
    kind: "logo",
    name,
    externalUrl,
    storagePath,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  if (parsed.data.kind !== "logo") return { error: "Check the form." };

  await createLogoAsset({ id: session.user.id }, workspace.id, {
    name: parsed.data.name,
    externalUrl: parsed.data.externalUrl,
    storagePath: parsed.data.storagePath,
  });
  revalidatePath(`/app/w/${slug}/brand-kit`);
  return { success: true };
}

export async function archiveLogoAssetAction(slug: string, assetId: string): Promise<void> {
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

export async function createFontAssetAction(
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

  const name = readString(formData, "name");
  const family = readString(formData, "family");
  const weightRaw = readString(formData, "weight");
  const role = readString(formData, "role") as "headline" | "body" | "accent" | "mono";

  const weight = Number(weightRaw);
  if (!Number.isInteger(weight)) {
    return { error: "Weight must be a whole number." };
  }

  const parsed = BrandAssetCommandSchema.safeParse({
    kind: "font",
    name,
    value: { family, weight, role },
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  if (parsed.data.kind !== "font") return { error: "Check the form." };

  await createFontAsset({ id: session.user.id }, workspace.id, {
    name: parsed.data.name,
    family: parsed.data.value.family,
    weight: parsed.data.value.weight,
    role: parsed.data.value.role,
  });
  revalidatePath(`/app/w/${slug}/brand-kit`);
  return { success: true };
}

export async function archiveFontAssetAction(slug: string, assetId: string): Promise<void> {
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
  await archiveBrandVoiceRule({ id: session.user.id }, workspace.id, ruleId);
  revalidatePath(`/app/w/${slug}/brand-kit`);
}

// ─── Publishing rules (Task 4) ─────────────────────────────────────────
// Publishing rules drive the editor's draft-time hints, so the role
// gate is wider than the brand-asset gate: `content_planner` may
// also create / archive. We mirror the service layer's policy
// (`BRAND_MANAGER_ROLES`) at the action layer so unauthorised
// callers are rejected before the service mutator is invoked.

const BRAND_MANAGER_ROLES = ["workspace_manager", "content_planner"] as const;

export async function createPublishingRuleAction(
  slug: string,
  _previous: unknown,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in is required." };
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return { error: "Workspace not found." };
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, [...BRAND_MANAGER_ROLES])))
    return { error: "Brand manager access is required." };

  const parsed = BrandPublishingRuleCommandSchema.safeParse({
    ruleType: readString(formData, "ruleType"),
    title: readString(formData, "title"),
    content: readString(formData, "content"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  await createBrandPublishingRule({ id: session.user.id }, workspace.id, parsed.data);
  revalidatePath(`/app/w/${slug}/brand-kit`);
  return { success: true };
}

export async function archivePublishingRuleAction(slug: string, ruleId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return;
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, [...BRAND_MANAGER_ROLES])))
    return;
  await archiveBrandPublishingRule({ id: session.user.id }, workspace.id, ruleId);
  revalidatePath(`/app/w/${slug}/brand-kit`);
}

// ─── Linked resources (Task 4) ─────────────────────────────────────────

export async function createLinkedResourceAction(
  slug: string,
  _previous: unknown,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in is required." };
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return { error: "Workspace not found." };
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, [...BRAND_MANAGER_ROLES])))
    return { error: "Brand manager access is required." };

  const descriptionRaw = readString(formData, "description");
  const parsed = BrandLinkedResourceCommandSchema.safeParse({
    provider: readString(formData, "provider"),
    name: readString(formData, "name"),
    url: readString(formData, "url"),
    description: descriptionRaw.length > 0 ? descriptionRaw : undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  await createBrandLinkedResource({ id: session.user.id }, workspace.id, parsed.data);
  revalidatePath(`/app/w/${slug}/brand-kit`);
  return { success: true };
}

export async function archiveLinkedResourceAction(slug: string, resourceId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return;
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, [...BRAND_MANAGER_ROLES])))
    return;
  await archiveBrandLinkedResource({ id: session.user.id }, workspace.id, resourceId);
  revalidatePath(`/app/w/${slug}/brand-kit`);
}

// ─── Restore actions (Round 4) ────────────────────────────────────────────
//
// Each `restoreXAction` mirrors its `archiveXAction` and is invoked from
// the Sonner "Undo" affordance after a soft-delete. The actions flip
// `archived_at` back to `null` via the service layer (which enforces the
// same role check as the archive path) and revalidate the page so the
// row reappears in its section grid.
//
// Permissions are identical to the archive path: brand-manager roles
// (workspace_manager / content_planner) for publishing rules + linked
// resources, workspace_manager only for assets + voice rules.

export async function restoreColorAssetAction(slug: string, assetId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return;
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"])))
    return;
  await restoreBrandAsset({ id: session.user.id }, workspace.id, assetId);
  revalidatePath(`/app/w/${slug}/brand-kit`);
}

export async function restoreLogoAssetAction(slug: string, assetId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return;
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"])))
    return;
  await restoreBrandAsset({ id: session.user.id }, workspace.id, assetId);
  revalidatePath(`/app/w/${slug}/brand-kit`);
}

export async function restoreFontAssetAction(slug: string, assetId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return;
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"])))
    return;
  await restoreBrandAsset({ id: session.user.id }, workspace.id, assetId);
  revalidatePath(`/app/w/${slug}/brand-kit`);
}

export async function restoreVoiceRuleAction(slug: string, ruleId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return;
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"])))
    return;
  await restoreBrandVoiceRule({ id: session.user.id }, workspace.id, ruleId);
  revalidatePath(`/app/w/${slug}/brand-kit`);
}

export async function restorePublishingRuleAction(slug: string, ruleId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return;
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, [...BRAND_MANAGER_ROLES])))
    return;
  await restoreBrandPublishingRule({ id: session.user.id }, workspace.id, ruleId);
  revalidatePath(`/app/w/${slug}/brand-kit`);
}

export async function restoreLinkedResourceAction(slug: string, resourceId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return;
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, [...BRAND_MANAGER_ROLES])))
    return;
  await restoreBrandLinkedResource({ id: session.user.id }, workspace.id, resourceId);
  revalidatePath(`/app/w/${slug}/brand-kit`);
}

// ─── Content pillars (Phase 8 — C-5.4) ──────────────────────────────────
//
// Pillars are the workspace's content taxonomy ("Education",
// "Product", "Behind the scenes"). The planning library has had
// full CRUD since FEAT-06; the brand-kit per-section page surfaces
// the same actions so designers and strategists can curate the
// taxonomy from the brand-kit surface without bouncing to
// /library. The service is the same — the role gate is
// `workspace_manager` or `content_planner` (mirrored from
// `lib/planning/pillars.ts`).

export async function createPillarAction(
  slug: string,
  _previous: unknown,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in is required." };
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return { error: "Workspace not found." };
  if (
    !(await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
      "workspace_manager",
      "content_planner",
    ]))
  ) {
    return { error: "Brand manager access is required." };
  }

  const color = readString(formData, "color") || undefined;
  const description = readString(formData, "description") || undefined;
  const parsed = CreatePillarSchema.safeParse({
    name: readString(formData, "name"),
    ...(color ? { color } : {}),
    ...(description ? { description } : {}),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  try {
    await createPillar({ id: session.user.id }, workspace.id, parsed.data);
  } catch (err) {
    if (err instanceof Error) return { error: err.message };
    return { error: "Failed to add pillar." };
  }
  revalidatePath(`/app/w/${slug}/brand-kit/pillars`);
  revalidatePath(`/app/w/${slug}/brand-kit`);
  return { success: true };
}

export async function archivePillarAction(slug: string, pillarId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return;
  if (
    !(await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
      "workspace_manager",
      "content_planner",
    ]))
  )
    return;
  try {
    await archivePillar({ id: session.user.id }, workspace.id, pillarId);
  } catch {
    // Best-effort: the undo toast re-fetches the page, so a failure
    // surfaces as the row reappearing.
  }
  revalidatePath(`/app/w/${slug}/brand-kit/pillars`);
  revalidatePath(`/app/w/${slug}/brand-kit`);
}

export async function restorePillarAction(slug: string, pillarId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return;
  if (
    !(await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
      "workspace_manager",
      "content_planner",
    ]))
  )
    return;
  try {
    await restorePillar({ id: session.user.id }, workspace.id, pillarId);
  } catch {
    // Same idempotent semantics as archive — a no-op is acceptable.
  }
  revalidatePath(`/app/w/${slug}/brand-kit/pillars`);
  revalidatePath(`/app/w/${slug}/brand-kit`);
}

// ─── Voice rule suggestions (Phase 8 / Phase 9) ──────────────────────────
//
// On-demand AI suggestions for the voice section. The user clicks
// "Suggest do rules" and the server reads the existing tone + do +
// don't rules, calls the model, and returns 2-3 new rules that
// are consistent with the existing voice but do not duplicate
// it. The agency must have the AI feature enabled (the existing
// capability allowlist gates the underlying /api/ai/generate
// route; we use the same key-resolution + budget flow so a
// 429 / 403 from one place surfaces here too).
export interface VoiceSuggestionsResult {
  ok: boolean;
  suggestions?: string[];
  error?: string;
}

export async function suggestVoiceRulesAction(
  slug: string,
  ruleType: "tone" | "do" | "dont",
): Promise<VoiceSuggestionsResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Sign in is required." };
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return { ok: false, error: "Workspace not found." };
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"]))) {
    return { ok: false, error: "Workspace manager access is required." };
  }

  // AI availability check — mirrors /api/ai/generate's gate.
  const ctx = await resolveActiveAgencyContext({ actor: { id: session.user.id } });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) return { ok: false, error: "Agency not configured." };
  const [feature] = await db
    .select()
    .from(aiFeatureSettings)
    .where(eq(aiFeatureSettings.agencyId, agencyId))
    .limit(1);
  if (!feature?.enabled || !feature.enabledCapabilities.includes("caption_drafts")) {
    return {
      ok: false,
      error: "AI suggestions are disabled in agency settings. Enable Caption drafts to use this.",
    };
  }
  const apiKey = await getActiveApiKey(agencyId);
  if (!apiKey && !hasAnyManagedSecretConfigured()) {
    return { ok: false, error: "AI features are disabled." };
  }

  // Pull the existing rules for the prompt's "do not duplicate" guard.
  const rows = await db
    .select({ ruleType: brandVoiceRules.ruleType, content: brandVoiceRules.content })
    .from(brandVoiceRules)
    .where(and(eq(brandVoiceRules.workspaceId, workspace.id), isNull(brandVoiceRules.archivedAt)));
  const existing = {
    tone: rows.filter((r) => r.ruleType === "tone").map((r) => r.content),
    do: rows.filter((r) => r.ruleType === "do").map((r) => r.content),
    dont: rows.filter((r) => r.ruleType === "dont").map((r) => r.content),
  };

  try {
    const suggestions = await suggestVoiceRules({
      ruleType,
      existingTone: existing.tone,
      existingDo: existing.do,
      existingDont: existing.dont,
      audience: workspace.name,
      ...(apiKey ? { apiKey } : {}),
    });
    return { ok: true, suggestions };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "AI suggestion failed.",
    };
  }
}
