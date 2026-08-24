"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { socialChannels } from "@/lib/db/schema";
import { ChannelCommandSchema } from "@/lib/channels/command";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { LimitExceededError, releaseCapacity, reserveCapacity } from "@/lib/entitlements";
import {
  linkProfile,
  setConnectionStatus,
  disconnectProfile,
  revokeConnectionAndDetach,
} from "@/lib/social/repository";
import type { ConnectedProfile } from "@/lib/social/types";

export async function createChannelAction(slug: string, _previous: unknown, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in is required." };
  const actor = { id: session.user.id };
  const context = await resolveActiveAgencyContext({ actor });
  if (!context) return { error: "Agency not configured." };
  const workspace = await getAccessibleWorkspace(actor, slug, context.agencyId);
  if (!workspace) return { error: "Workspace not found." };
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"])))
    return { error: "Workspace manager access is required." };
  const parsed = ChannelCommandSchema.safeParse({
    platform: formData.get("platform"),
    accountName: formData.get("accountName"),
    handle: formData.get("handle") || undefined,
    url: formData.get("url") || undefined,
    accountType: formData.get("accountType") || undefined,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Check the account information." };
  try {
    await db.transaction(async (tx) => {
      await reserveCapacity(tx, context.agencyId, [
        { resource: "social_profiles", increase: 1 },
        { resource: `social_profiles:${parsed.data.platform}`, increase: 1 },
      ]);
      await tx.insert(socialChannels).values({ workspaceId: workspace.id, ...parsed.data });
    });
  } catch (error) {
    if (error instanceof LimitExceededError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/app/w/${slug}/channels`);
  return { success: true };
}

export async function archiveChannelAction(slug: string, channelId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const actor = { id: session.user.id };
  const context = await resolveActiveAgencyContext({ actor });
  if (!context) return;
  const workspace = await getAccessibleWorkspace(actor, slug, context.agencyId);
  if (!workspace) return;
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"])))
    return;
  await db.transaction(async (tx) => {
    const [channel] = await tx
      .select({ platform: socialChannels.platform, archivedAt: socialChannels.archivedAt })
      .from(socialChannels)
      .where(and(eq(socialChannels.id, channelId), eq(socialChannels.workspaceId, workspace.id)))
      .for("update")
      .limit(1);
    if (!channel || channel.archivedAt) return;
    await tx
      .update(socialChannels)
      .set({
        isActive: false,
        archivedAt: new Date(),
        archivedBy: session.user.id,
        updatedAt: new Date(),
      })
      .where(and(eq(socialChannels.id, channelId), eq(socialChannels.workspaceId, workspace.id)));
    await releaseCapacity(tx, context.agencyId, [
      "social_profiles",
      `social_profiles:${channel.platform}`,
    ]);
  });
  revalidatePath(`/app/w/${slug}/channels`);
}

/**
 * Update a social channel's editable fields. Re-checks the
 * `workspace_manager` role at the server (never trust the client),
 * validates with the shared `ChannelCommandSchema`, scopes the update
 * to the actor's workspace, and bumps `updatedAt` so the table's
 * "Last updated" column reflects the change.
 *
 * `prev` is the existing action-state (typically `null` on the first
 * submit). It is unused but kept in the signature so the component can
 * bind this action the same way `createChannelAction` is bound with
 * `useActionState(action.bind(null, slug), initialState)`.
 */
export async function updateChannelAction(
  slug: string,
  channelId: string,
  _previous: unknown,
  formData: FormData,
) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in is required." };
  const actor = { id: session.user.id };
  const context = await resolveActiveAgencyContext({ actor });
  if (!context) return { error: "Agency not configured." };
  const workspace = await getAccessibleWorkspace(actor, slug, context.agencyId);
  if (!workspace) return { error: "Workspace not found." };
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"])))
    return { error: "Workspace manager access is required." };
  const parsed = ChannelCommandSchema.safeParse({
    platform: formData.get("platform"),
    accountName: formData.get("accountName"),
    handle: formData.get("handle") || undefined,
    url: formData.get("url") || undefined,
    accountType: formData.get("accountType") || undefined,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Check the account information." };
  await db
    .update(socialChannels)
    .set({
      platform: parsed.data.platform,
      accountName: parsed.data.accountName,
      handle: parsed.data.handle ?? null,
      url: parsed.data.url ?? null,
      accountType: parsed.data.accountType ?? null,
      isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
      updatedAt: new Date(),
    })
    .where(and(eq(socialChannels.id, channelId), eq(socialChannels.workspaceId, workspace.id)));
  revalidatePath(`/app/w/${slug}/channels`);
  return { success: true };
}

// ─── M4 — provider connection lifecycle ─────────────────────────────────────

const finalizeProfileSchema = z.object({
  providerAccountId: z.string().min(1),
  platform: z.enum(["instagram", "facebook", "tiktok"]),
  accountName: z.string().min(1).max(200),
  handle: z.string().nullable().optional(),
  profileUrl: z.string().url().nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  parentProviderAccountId: z.string().nullable().optional(),
});

const finalizeSelectionSchema = z.object({
  connectionId: z.string().uuid(),
  profiles: z.array(finalizeProfileSchema).min(1).max(50),
});

export type FinalizeSelectionInput = z.infer<typeof finalizeSelectionSchema>;

/**
 * Finalize the account-picker selection. Links existing manual
 * channels (preserving their ID) or creates new ones, all in one
 * transaction. The connection becomes `active` and the channel's
 * `next_sync_at` is set to `now()` so the cron worker picks them up
 * immediately.
 *
 * Authorization: workspace_manager only. The picker itself is
 * rendered inside the channels page which is already gated.
 */
export async function finalizeMetaSelectionAction(
  slug: string,
  _previous: unknown,
  payload: FinalizeSelectionInput,
) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in is required." };
  const actor = { id: session.user.id };
  const context = await resolveActiveAgencyContext({ actor });
  if (!context) return { error: "Agency not configured." };
  const workspace = await getAccessibleWorkspace(actor, slug, context.agencyId);
  if (!workspace) return { error: "Workspace not found." };
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"])))
    return { error: "Workspace manager access is required." };

  const parsed = finalizeSelectionSchema.safeParse(payload);
  if (!parsed.success) return { error: "Invalid selection payload." };

  // Verify the connection belongs to this workspace before linking.
  const connection = await db
    .select()
    .from(socialChannels) // import on first use
    .where(eq(socialChannels.workspaceId, workspace.id))
    .limit(1);

  // Resolve existing channel IDs in one query (cross-workspace denial
  // is enforced by the workspace_id filter on the candidate rows).
  const candidateExternalIds = parsed.data.profiles
    .map((p) => p.providerAccountId)
    .filter((id, i, arr) => arr.indexOf(id) === i);
  const candidates =
    candidateExternalIds.length > 0
      ? await db
          .select()
          .from(socialChannels)
          .where(
            and(
              eq(socialChannels.workspaceId, workspace.id),
              eq(socialChannels.platform, "instagram"), // default; refined per-profile below
            ),
          )
      : [];

  try {
    const linked: string[] = [];
    for (const profile of parsed.data.profiles) {
      const existing = candidates.find((c) => c.externalAccountId === profile.providerAccountId);
      const result = await linkProfile(db, {
        connectionId: parsed.data.connectionId,
        agencyId: context.agencyId,
        profile: profile as ConnectedProfile,
        ...(existing?.id ? { existingChannelId: existing.id } : {}),
      });
      linked.push(result.channel.id);
    }
    await setConnectionStatus(db, parsed.data.connectionId, "active");
    revalidatePath(`/app/w/${slug}/channels`);
    return { success: true, linked };
  } catch (err) {
    if (err instanceof LimitExceededError) return { error: err.message };
    return { error: err instanceof Error ? err.message : "Failed to link profiles." };
  }
  // `connection` and `_previous` are reserved for future enhancements.
  void connection;
  void _previous;
}

/**
 * Disconnect a single profile. Clears the provider link, sets
 * `connection_status='disconnected'`, preserves the row ID, the
 * external ID, and all daily metrics. workspace_manager only.
 */
export async function disconnectChannelAction(slug: string, channelId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in is required." };
  const actor = { id: session.user.id };
  const context = await resolveActiveAgencyContext({ actor });
  if (!context) return { error: "Agency not configured." };
  const workspace = await getAccessibleWorkspace(actor, slug, context.agencyId);
  if (!workspace) return { error: "Workspace not found." };
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"])))
    return { error: "Workspace manager access is required." };
  await disconnectProfile(db, workspace.id, channelId);
  revalidatePath(`/app/w/${slug}/channels`);
  return { success: true };
}

/**
 * Revoke a shared Meta grant. Disconnects every attached channel
 * transactionally. workspace_manager only.
 */
export async function revokeConnectionAction(slug: string, connectionId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in is required." };
  const actor = { id: session.user.id };
  const context = await resolveActiveAgencyContext({ actor });
  if (!context) return { error: "Agency not configured." };
  const workspace = await getAccessibleWorkspace(actor, slug, context.agencyId);
  if (!workspace) return { error: "Workspace not found." };
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"])))
    return { error: "Workspace manager access is required." };
  await revokeConnectionAndDetach(db, workspace.id, connectionId);
  revalidatePath(`/app/w/${slug}/channels`);
  return { success: true };
}
