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
import {
  colorTemplates,
  pillarTemplates,
  publishingTemplates,
  typographyTemplates,
  voiceTemplates,
} from "@/lib/brand/templates";

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

// ─── Template library (Phase 8) ───────────────────────────────────────────
//
// One-click "Add to brand kit" actions for the curated template
// library (lib/brand/templates.ts). Each action takes a template
// id, looks it up in the static catalog, and writes the
// underlying entity via the same service / action surface that
// the inline forms use. Idempotency is enforced at the service
// level (the partial unique index on pillars, the existence
// check for color / voice duplicates).

export interface TemplateAddResult {
  ok: boolean;
  added?: number;
  error?: string;
}

export async function addVoiceTemplateAction(
  slug: string,
  templateId: string,
): Promise<TemplateAddResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Sign in is required." };
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return { ok: false, error: "Workspace not found." };
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"])))
    return { ok: false, error: "Workspace manager access is required." };

  const tpl = voiceTemplates.find((t) => t.id === templateId);
  if (!tpl) return { ok: false, error: "Voice template not found." };

  // Idempotency: skip if the same content already exists in this bucket.
  const existing = await db
    .select({ id: brandVoiceRules.id })
    .from(brandVoiceRules)
    .where(
      and(
        eq(brandVoiceRules.workspaceId, workspace.id),
        eq(brandVoiceRules.ruleType, tpl.ruleType),
        eq(brandVoiceRules.content, tpl.content),
        isNull(brandVoiceRules.archivedAt),
      ),
    )
    .limit(1);
  if (existing.length > 0) return { ok: true, added: 0 };

  const parsed = BrandVoiceRuleCommandSchema.safeParse({
    ruleType: tpl.ruleType,
    content: tpl.content,
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid template." };
  await db.insert(brandVoiceRules).values({
    workspaceId: workspace.id,
    createdBy: session.user.id,
    ruleType: parsed.data.ruleType,
    content: parsed.data.content,
    sortOrder: "0",
  });
  revalidatePath(`/app/w/${slug}/brand-kit/voice`);
  revalidatePath(`/app/w/${slug}/brand-kit`);
  return { ok: true, added: 1 };
}

export async function addPillarTemplateAction(
  slug: string,
  templateId: string,
): Promise<TemplateAddResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Sign in is required." };
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return { ok: false, error: "Workspace not found." };
  if (
    !(await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
      "workspace_manager",
      "content_planner",
    ]))
  )
    return { ok: false, error: "Brand manager access is required." };

  const tpl = pillarTemplates.find((t) => t.id === templateId);
  if (!tpl) return { ok: false, error: "Pillar template not found." };

  try {
    await createPillar({ id: session.user.id }, workspace.id, {
      name: tpl.name,
      ...(tpl.color ? { color: tpl.color } : {}),
      description: tpl.description,
    });
    revalidatePath(`/app/w/${slug}/brand-kit/pillars`);
    revalidatePath(`/app/w/${slug}/brand-kit`);
    return { ok: true, added: 1 };
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.toLowerCase().includes("already exists")) {
        return { ok: true, added: 0 };
      }
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Failed to add pillar." };
  }
}

export async function addColorPaletteAction(
  slug: string,
  templateId: string,
): Promise<TemplateAddResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Sign in is required." };
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return { ok: false, error: "Workspace not found." };
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"])))
    return { ok: false, error: "Workspace manager access is required." };

  const tpl = colorTemplates.find((t) => t.id === templateId);
  if (!tpl) return { ok: false, error: "Color palette template not found." };

  // Idempotency: skip the whole palette if every swatch already
  // exists by (name, hex) — matches the existing service-layer
  // "you can add the same hex twice" rule (the audit still gets
  // a new row, but the UI collapses the duplicates in the grid).
  const existing = await db
    .select({ name: brandAssets.name, value: brandAssets.value })
    .from(brandAssets)
    .where(
      and(
        eq(brandAssets.workspaceId, workspace.id),
        eq(brandAssets.kind, "color"),
        isNull(brandAssets.archivedAt),
      ),
    );
  const existingKeys = new Set(
    existing.map((row) => `${row.name}::${(row.value as { hex?: string }).hex ?? ""}`),
  );
  let added = 0;
  for (const swatch of tpl.swatches) {
    if (existingKeys.has(`${swatch.name}::${swatch.hex}`)) continue;
    await createColorAsset({ id: session.user.id }, workspace.id, {
      name: swatch.name,
      hex: swatch.hex,
      colorRole: swatch.role,
    });
    added++;
  }
  revalidatePath(`/app/w/${slug}/brand-kit/colors`);
  revalidatePath(`/app/w/${slug}/brand-kit`);
  return { ok: true, added };
}

export async function addTypographyTemplateAction(
  slug: string,
  templateId: string,
): Promise<TemplateAddResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Sign in is required." };
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return { ok: false, error: "Workspace not found." };
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"])))
    return { ok: false, error: "Workspace manager access is required." };

  const tpl = typographyTemplates.find((t) => t.id === templateId);
  if (!tpl) return { ok: false, error: "Typography template not found." };

  const existing = await db
    .select({ value: brandAssets.value })
    .from(brandAssets)
    .where(
      and(
        eq(brandAssets.workspaceId, workspace.id),
        eq(brandAssets.kind, "font"),
        isNull(brandAssets.archivedAt),
      ),
    );
  const existingFamilies = new Set(
    existing
      .map((row) => (row.value as { family?: string }).family)
      .filter((f): f is string => typeof f === "string"),
  );
  let added = 0;
  for (const face of tpl.faces) {
    if (existingFamilies.has(face.family)) continue;
    await createFontAsset({ id: session.user.id }, workspace.id, {
      name: face.family,
      family: face.family,
      weight: face.weight,
      role: face.role,
    });
    added++;
  }
  revalidatePath(`/app/w/${slug}/brand-kit/typography`);
  revalidatePath(`/app/w/${slug}/brand-kit`);
  return { ok: true, added };
}

export async function addPublishingTemplateAction(
  slug: string,
  templateId: string,
): Promise<TemplateAddResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Sign in is required." };
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return { ok: false, error: "Workspace not found." };
  if (
    !(await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
      "workspace_manager",
      "content_planner",
    ]))
  )
    return { ok: false, error: "Brand manager access is required." };

  const tpl = publishingTemplates.find((t) => t.id === templateId);
  if (!tpl) return { ok: false, error: "Publishing template not found." };

  try {
    await createBrandPublishingRule({ id: session.user.id }, workspace.id, {
      ruleType: tpl.ruleType,
      title: tpl.title,
      content: tpl.content,
    });
    revalidatePath(`/app/w/${slug}/brand-kit/publishing`);
    revalidatePath(`/app/w/${slug}/brand-kit`);
    return { ok: true, added: 1 };
  } catch (err) {
    if (err instanceof Error) return { ok: false, error: err.message };
    return { ok: false, error: "Failed to add publishing rule." };
  }
}
