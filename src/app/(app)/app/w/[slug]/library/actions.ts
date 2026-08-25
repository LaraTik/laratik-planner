"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { archiveCampaign, createCampaign } from "@/lib/planning/campaigns";
import { archivePillar, createPillar } from "@/lib/planning/pillars";
import { archiveTemplate, createTemplate } from "@/lib/planning/templates";
import { duplicateContentItem } from "@/lib/planning/content-clone";

/**
 * Planning library server actions (FEAT-06).
 *
 * Thin "use server" wrappers that perform the same `hasWorkspaceRole`
 * gate at the action layer that the service does. The service is the
 * authoritative gate (defence in depth per §9); the action just
 * gives the form a typed envelope and revalidates the right path.
 *
 * The shape is `{ error?, success? }` so the client can render
 * inline. Errors from the service are surfaced verbatim when they
 * look like business validation; anything else becomes a generic
 * "could not save" so we never leak a stack trace.
 */

export type LibraryActionState = { error?: string; success?: boolean };

async function authedContext(slug: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in is required." } as const;
  const actor = await currentActor();
  if (!actor) return { error: "Sign in is required." } as const;
  const ctx = await resolveActiveAgencyContext({ actor });
  if (!ctx) return { error: "Agency not configured." } as const;
  const workspace = await getAccessibleWorkspace(actor, slug, ctx.agencyId);
  if (!workspace) return { error: "Workspace not found." } as const;
  if (
    !(await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
      "workspace_manager",
      "content_planner",
    ]))
  ) {
    return { error: "Workspace manager or content planner access is required." } as const;
  }
  return { actor, session, workspace, agencyId: ctx.agencyId } as const;
}

const dateInput = z
  .union([z.string().min(1), z.date()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  });

const CreateCampaignFormSchema = z.object({
  name: z.string().trim().min(2).max(120),
  objective: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined)),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined)),
  startDate: dateInput,
  endDate: dateInput,
  coverColor: z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{6})$/, "coverColor must be a #rrggbb hex code")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined)),
});
type CreateCampaignFormData = z.infer<typeof CreateCampaignFormSchema>;

export async function createCampaignAction(
  slug: string,
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const authed = await authedContext(slug);
  if ("error" in authed) return { error: authed.error };
  const parsed = CreateCampaignFormSchema.safeParse({
    name: formData.get("name"),
    objective: formData.get("objective") ?? undefined,
    description: formData.get("description") ?? undefined,
    startDate: formData.get("startDate") ?? undefined,
    endDate: formData.get("endDate") ?? undefined,
    coverColor: formData.get("coverColor") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid campaign" };
  }
  try {
    const data: CreateCampaignFormData = parsed.data;
    await createCampaign(authed.actor, authed.workspace.id, {
      ...data,
      status: "draft",
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not create campaign" };
  }
  revalidatePath(`/app/w/${slug}/library`);
  return { success: true };
}

export async function archiveCampaignAction(
  slug: string,
  campaignId: string,
): Promise<LibraryActionState> {
  const authed = await authedContext(slug);
  if ("error" in authed) return { error: authed.error };
  try {
    await archiveCampaign(authed.actor, authed.workspace.id, campaignId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not archive campaign" };
  }
  revalidatePath(`/app/w/${slug}/library`);
  return { success: true };
}

const CreatePillarFormSchema = z.object({
  name: z.string().trim().min(2).max(80),
  color: z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{6})$/, "color must be a #rrggbb hex code")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined)),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined)),
});

export async function createPillarAction(
  slug: string,
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const authed = await authedContext(slug);
  if ("error" in authed) return { error: authed.error };
  const parsed = CreatePillarFormSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color") ?? undefined,
    description: formData.get("description") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid pillar" };
  }
  try {
    await createPillar(authed.actor, authed.workspace.id, parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not create pillar" };
  }
  revalidatePath(`/app/w/${slug}/library`);
  return { success: true };
}

export async function archivePillarAction(
  slug: string,
  pillarId: string,
): Promise<LibraryActionState> {
  const authed = await authedContext(slug);
  if ("error" in authed) return { error: authed.error };
  try {
    await archivePillar(authed.actor, authed.workspace.id, pillarId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not archive pillar" };
  }
  revalidatePath(`/app/w/${slug}/library`);
  return { success: true };
}

const CreateTemplateFormSchema = z.object({
  name: z.string().trim().min(2).max(120),
  format: z.enum([
    "static_post",
    "carousel",
    "story",
    "short_form_video",
    "long_form_video",
    "live_content",
    "article",
    "other",
  ]),
  briefTemplate: z
    .string()
    .trim()
    .max(8000)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined)),
});

export async function createTemplateAction(
  slug: string,
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const authed = await authedContext(slug);
  if ("error" in authed) return { error: authed.error };
  const parsed = CreateTemplateFormSchema.safeParse({
    name: formData.get("name"),
    format: formData.get("format"),
    briefTemplate: formData.get("briefTemplate") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid template" };
  }
  try {
    await createTemplate(authed.actor, authed.workspace.id, {
      ...parsed.data,
      defaultChannelIds: [],
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not create template" };
  }
  revalidatePath(`/app/w/${slug}/library`);
  return { success: true };
}

export async function archiveTemplateAction(
  slug: string,
  templateId: string,
): Promise<LibraryActionState> {
  const authed = await authedContext(slug);
  if ("error" in authed) return { error: authed.error };
  try {
    await archiveTemplate(authed.actor, authed.workspace.id, templateId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not archive template" };
  }
  revalidatePath(`/app/w/${slug}/library`);
  return { success: true };
}

/**
 * Duplicate any content item by id. Resolves the workspace from the
 * source's workspace_id so the planner can hit the action from any
 * page that knows the item's id.
 */
export async function duplicateContentItemAction(
  slug: string,
  sourceContentItemId: string,
): Promise<LibraryActionState & { newId?: string }> {
  const authed = await authedContext(slug);
  if ("error" in authed) return { error: authed.error };
  try {
    const out = await duplicateContentItem(authed.actor, sourceContentItemId);
    revalidatePath(`/app/w/${slug}/library`);
    return { success: true, newId: out.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not duplicate content item" };
  }
}
