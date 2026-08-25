import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { socialChannels } from "@/lib/db/schema";
import { hasWorkspaceRole, requirePolicy, type Actor } from "@/lib/auth/policy";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { ChannelCommandSchema } from "@/lib/channels/command";

/**
 * Channels service (FEAT-07).
 *
 * §14 listed `createChannel`, `updateChannel`, `archiveChannel`, and
 * `restoreChannel` as required commands. The page-level actions in
 * `src/app/(app)/app/w/[slug]/channels/actions.ts` already
 * implemented create / update / archive, but they lived outside the
 * service layer — the §14 contract was missing the matching
 * service-level exports and `restoreChannel` did not exist at all.
 *
 * This module is the service surface: each command takes
 * `(actor, workspaceId, input)` and enforces the
 * `workspace_manager` gate. The page-level actions are thin
 * `use server` wrappers; the service is the authoritative gate
 * (defence in depth per §9).
 *
 * The archive command also releases the per-platform capacity
 * reservation; restore re-reserves it. Capacity errors are
 * re-thrown so the action layer can surface the entitlement
 * message verbatim.
 */

import { LimitExceededError, releaseCapacity, reserveCapacity } from "@/lib/entitlements";

// ─── createChannel ─────────────────────────────────────────────────────────

export type CreateChannelInput = z.infer<typeof ChannelCommandSchema>;

export async function createChannel(actor: Actor, workspaceId: string, input: CreateChannelInput) {
  const parsed = ChannelCommandSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, ["workspace_manager"]),
    "create_channel",
  );
  try {
    return await db.transaction(async (tx) => {
      await reserveCapacity(tx, await resolveAgencyIdForWorkspace(workspaceId), [
        { resource: "social_profiles", increase: 1 },
        { resource: `social_profiles:${parsed.data.platform}`, increase: 1 },
      ]);
      const [created] = await tx
        .insert(socialChannels)
        .values({ workspaceId, ...parsed.data })
        .returning({ id: socialChannels.id });
      if (!created) throw new Error("Failed to create channel");
      revalidatePath(`/app/w/`);
      return { id: created.id };
    });
  } catch (err) {
    if (err instanceof LimitExceededError) throw err;
    throw err;
  }
}

// ─── updateChannel ─────────────────────────────────────────────────────────

export type UpdateChannelInput = {
  channelId: string;
} & Partial<CreateChannelInput>;

export async function updateChannel(actor: Actor, workspaceId: string, input: UpdateChannelInput) {
  const baseShape = ChannelCommandSchema.partial();
  const parsed = baseShape.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, ["workspace_manager"]),
    "update_channel",
  );
  const [existing] = await db
    .select({ id: socialChannels.id, platform: socialChannels.platform })
    .from(socialChannels)
    .where(and(eq(socialChannels.id, input.channelId), eq(socialChannels.workspaceId, workspaceId)))
    .limit(1);
  if (!existing) throw new Error("Channel not found");
  await db
    .update(socialChannels)
    .set({
      ...(parsed.data.platform ? { platform: parsed.data.platform } : {}),
      ...(parsed.data.accountName !== undefined ? { accountName: parsed.data.accountName } : {}),
      ...(parsed.data.handle !== undefined ? { handle: parsed.data.handle ?? null } : {}),
      ...(parsed.data.url !== undefined ? { url: parsed.data.url ?? null } : {}),
      ...(parsed.data.accountType !== undefined
        ? { accountType: parsed.data.accountType ?? null }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(eq(socialChannels.id, input.channelId), eq(socialChannels.workspaceId, workspaceId)),
    );
  revalidatePath(`/app/w/`);
}

// ─── archiveChannel ────────────────────────────────────────────────────────

export async function archiveChannel(actor: Actor, workspaceId: string, channelId: string) {
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, ["workspace_manager"]),
    "archive_channel",
  );
  await db.transaction(async (tx) => {
    const [channel] = await tx
      .select({ platform: socialChannels.platform, archivedAt: socialChannels.archivedAt })
      .from(socialChannels)
      .where(and(eq(socialChannels.id, channelId), eq(socialChannels.workspaceId, workspaceId)))
      .for("update")
      .limit(1);
    if (!channel || channel.archivedAt) return;
    await tx
      .update(socialChannels)
      .set({
        isActive: false,
        archivedAt: new Date(),
        archivedBy: actor.id,
        updatedAt: new Date(),
      })
      .where(and(eq(socialChannels.id, channelId), eq(socialChannels.workspaceId, workspaceId)));
    await releaseCapacity(tx, await resolveAgencyIdForWorkspace(workspaceId), [
      "social_profiles",
      `social_profiles:${channel.platform}`,
    ]);
  });
  revalidatePath(`/app/w/`);
}

// ─── restoreChannel (FEAT-07) ──────────────────────────────────────────────

export async function restoreChannel(actor: Actor, workspaceId: string, channelId: string) {
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, ["workspace_manager"]),
    "restore_channel",
  );
  try {
    await db.transaction(async (tx) => {
      const [channel] = await tx
        .select({ platform: socialChannels.platform, archivedAt: socialChannels.archivedAt })
        .from(socialChannels)
        .where(and(eq(socialChannels.id, channelId), eq(socialChannels.workspaceId, workspaceId)))
        .for("update")
        .limit(1);
      if (!channel) throw new Error("Channel not found");
      if (!channel.archivedAt) return; // idempotent — already active
      await reserveCapacity(tx, await resolveAgencyIdForWorkspace(workspaceId), [
        { resource: "social_profiles", increase: 1 },
        { resource: `social_profiles:${channel.platform}`, increase: 1 },
      ]);
      await tx
        .update(socialChannels)
        .set({
          isActive: true,
          archivedAt: null,
          archivedBy: null,
          updatedAt: new Date(),
        })
        .where(and(eq(socialChannels.id, channelId), eq(socialChannels.workspaceId, workspaceId)));
    });
  } catch (err) {
    if (err instanceof LimitExceededError) throw err;
    throw err;
  }
  revalidatePath(`/app/w/`);
}

// ─── Read helpers ──────────────────────────────────────────────────────────

export async function listActiveChannelsForWorkspace(workspaceId: string) {
  return db
    .select()
    .from(socialChannels)
    .where(
      and(
        eq(socialChannels.workspaceId, workspaceId),
        eq(socialChannels.isActive, true),
        isNull(socialChannels.archivedAt),
      ),
    );
}

// ─── Internal helpers ─────────────────────────────────────────────────────

import { workspaces } from "@/lib/db/schema";

/**
 * Resolve the agency_id that owns a workspace. Needed because the
 * capacity reservation API is keyed on agency_id. One-row lookup;
 * cached in a per-process Map for the few service calls that hit
 * it on every archive/restore.
 */
const agencyIdCache = new Map<string, string>();
async function resolveAgencyIdForWorkspace(workspaceId: string): Promise<string> {
  const cached = agencyIdCache.get(workspaceId);
  if (cached) return cached;
  const [ws] = await db
    .select({ agencyId: workspaces.agencyId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!ws) throw new Error("Workspace not found");
  agencyIdCache.set(workspaceId, ws.agencyId);
  return ws.agencyId;
}
