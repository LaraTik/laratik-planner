import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { activityEvents, contentItemChannels, contentItems, workspaces } from "@/lib/db/schema";
import { hasWorkspaceRole, isAgencyAdmin, type Actor } from "@/lib/auth/policy";
import { PlatformPayloadSchema, type PlatformPayload } from "./payload-schemas";
import { recordMaterialityEvent, MATERIAL_RESOURCE_PLATFORM_PAYLOAD } from "./materiality";

/**
 * STUDIOFLOW_MASTER_PROMPT.md §4 (Milestone 4) — Platform
 * payload service.
 *
 * Responsibilities:
 *   1. Validate a `PlatformPayload` against the Zod
 *      discriminated union before persisting.
 *   2. Persist the payload to `content_item_channel.platform_payload`
 *      (jsonb) with `schemaVersion: 1`.
 *   3. Read the payload back, parsing it through the same
 *      schema to keep the read side in lockstep with the write
 *      side.
 *   4. Route every write through the **materiality service**
 *      (M4.3): a platform payload is a material edit per the
 *      master prompt's "Material edits and approvals" section,
 *      so the change increments the content item's `revision`,
 *      resets the affected approvals, and records an
 *      immutable event.
 *
 * Authority: a workspace member with `workspace_manager` or
 * `content_planner` role can save a draft. The
 * `finalCopyApproved` flag is the only field that requires
 * agency-admin authority (handled by M4.3's approve mutation,
 * not by this service).
 */
export const SavePlatformPayloadInputSchema = z.object({
  contentItemId: z.string().uuid(),
  socialChannelId: z.string().uuid(),
  payload: PlatformPayloadSchema,
});
export type SavePlatformPayloadInput = z.infer<typeof SavePlatformPayloadInputSchema>;

export const FinalCopyApprovalInputSchema = z.object({
  contentItemId: z.string().uuid(),
  socialChannelId: z.string().uuid(),
  approved: z.boolean(),
});
export type FinalCopyApprovalInput = z.infer<typeof FinalCopyApprovalInputSchema>;

export class PlatformPayloadError extends Error {
  public readonly code: "INVALID" | "NOT_FOUND" | "FORBIDDEN" | "CROSS_CHANNEL";
  public readonly details: Record<string, unknown>;
  constructor(
    code: "INVALID" | "NOT_FOUND" | "FORBIDDEN" | "CROSS_CHANNEL",
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "PlatformPayloadError";
    this.code = code;
    this.details = details;
  }
}

async function ensureContentItemChannelInWorkspace(
  contentItemId: string,
  socialChannelId: string,
  workspaceId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: contentItemChannels.id })
    .from(contentItemChannels)
    .innerJoin(contentItems, eq(contentItems.id, contentItemChannels.contentItemId))
    .where(
      and(
        eq(contentItemChannels.contentItemId, contentItemId),
        eq(contentItemChannels.socialChannelId, socialChannelId),
        eq(contentItems.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new PlatformPayloadError(
      "NOT_FOUND",
      "Content item channel link not found in this workspace.",
      { contentItemId, socialChannelId, workspaceId },
    );
  }
}

/**
 * Persist a platform payload. The full write path is:
 *   1. Zod-parse the payload (already done by the schema wrapper).
 *   2. Assert the content item + channel live in the actor's
 *      workspace.
 *   3. UPSERT the row's `platform_payload` column.
 *   4. Route through the materiality service: increment the
 *      content item's `revision`, reset affected approvals, and
 *      record an immutable `materiality_event` row.
 */
export async function savePlatformPayload(
  actor: Actor,
  workspaceId: string,
  input: SavePlatformPayloadInput,
): Promise<PlatformPayload> {
  // Role gate — `content_planner` and `workspace_manager` can
  // save a draft. (Publisher is included in M2 but the publish
  // service is a separate code path that consumes the
  // `finalCopyApproved` flag we never set from this service.)
  const allowed = await hasWorkspaceRole({ id: actor.id }, workspaceId, [
    "workspace_manager",
    "content_planner",
  ]);
  if (!allowed) {
    throw new PlatformPayloadError(
      "FORBIDDEN",
      "Only workspace managers and content planners can save a publish package.",
      { workspaceId },
    );
  }

  await ensureContentItemChannelInWorkspace(
    input.contentItemId,
    input.socialChannelId,
    workspaceId,
  );

  // The schema is the source of truth. The discriminated union
  // narrows the payload type at the call site.
  // Approval metadata is server-owned. A material draft save always
  // invalidates the previous approval and must never trust values sent
  // by the browser.
  const payload = PlatformPayloadSchema.parse({
    ...input.payload,
    approval: {
      finalCopyApproved: false,
      approvedByUserId: null,
      approvedAt: null,
    },
  });

  await db
    .update(contentItemChannels)
    .set({ platformPayload: payload, updatedAt: new Date() })
    .where(
      and(
        eq(contentItemChannels.contentItemId, input.contentItemId),
        eq(contentItemChannels.socialChannelId, input.socialChannelId),
      ),
    );

  // Materiality — payload is a material edit per the master
  // prompt's "Material edits and approvals" section.
  const materiality = await recordMaterialityEvent({
    actor,
    contentItemId: input.contentItemId,
    resource: MATERIAL_RESOURCE_PLATFORM_PAYLOAD,
    beforeValue: null, // The materiality service diffs the channel row.
    afterValue: payload,
    reasonCode: "platform_payload.save",
  });

  await db
    .update(contentItemChannels)
    .set({ copySourceRevision: materiality.revision, updatedAt: new Date() })
    .where(
      and(
        eq(contentItemChannels.contentItemId, input.contentItemId),
        eq(contentItemChannels.socialChannelId, input.socialChannelId),
      ),
    );

  return payload;
}

/**
 * Approve or revoke the final copy without turning that administrative
 * decision into another material edit. Only an active agency admin may
 * perform this mutation; actor and timestamp are always stamped here.
 */
export async function setFinalCopyApproval(
  actor: Actor,
  workspaceId: string,
  input: FinalCopyApprovalInput,
): Promise<PlatformPayload> {
  const parsed = FinalCopyApprovalInputSchema.parse(input);
  const [workspace] = await db
    .select({ agencyId: workspaces.agencyId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) {
    throw new PlatformPayloadError("NOT_FOUND", "Workspace not found.", { workspaceId });
  }
  if (!(await isAgencyAdmin(actor, workspace.agencyId))) {
    throw new PlatformPayloadError(
      "FORBIDDEN",
      "Only an agency administrator can approve final copy.",
      { workspaceId },
    );
  }

  await ensureContentItemChannelInWorkspace(
    parsed.contentItemId,
    parsed.socialChannelId,
    workspaceId,
  );

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM content_item_channel
          WHERE content_item_id = ${parsed.contentItemId}
            AND social_channel_id = ${parsed.socialChannelId}
          FOR UPDATE`,
    );
    const [row] = await tx
      .select({ platformPayload: contentItemChannels.platformPayload })
      .from(contentItemChannels)
      .where(
        and(
          eq(contentItemChannels.contentItemId, parsed.contentItemId),
          eq(contentItemChannels.socialChannelId, parsed.socialChannelId),
        ),
      )
      .limit(1);
    if (!row?.platformPayload) {
      throw new PlatformPayloadError(
        "INVALID",
        "Save the publish package before approving final copy.",
      );
    }

    const existing = PlatformPayloadSchema.safeParse(row.platformPayload);
    if (!existing.success) {
      throw new PlatformPayloadError(
        "INVALID",
        "The saved publish package is invalid. Save it again before approving.",
      );
    }
    const payload = PlatformPayloadSchema.parse({
      ...existing.data,
      approval: {
        finalCopyApproved: parsed.approved,
        approvedByUserId: parsed.approved ? actor.id : null,
        approvedAt: parsed.approved ? new Date().toISOString() : null,
      },
    });

    await tx
      .update(contentItemChannels)
      .set({ platformPayload: payload, updatedAt: new Date() })
      .where(
        and(
          eq(contentItemChannels.contentItemId, parsed.contentItemId),
          eq(contentItemChannels.socialChannelId, parsed.socialChannelId),
        ),
      );
    await tx.insert(activityEvents).values({
      workspaceId,
      contentItemId: parsed.contentItemId,
      actorId: actor.id,
      kind: "update",
      summary: parsed.approved ? "Final copy approved" : "Final-copy approval revoked",
      beforeData: existing.data.approval,
      afterData: payload.approval,
      metadata: {
        resource: "publish_final_copy_approval",
        socialChannelId: parsed.socialChannelId,
        material: false,
      },
    });
    return payload;
  });
}

/**
 * Read a platform payload. Returns the parsed payload, or
 * `null` if the channel row exists but has no payload yet.
 * Throws if the row is missing or in a different workspace.
 */
export async function readPlatformPayload(input: {
  actor: Actor;
  workspaceId: string;
  contentItemId: string;
  socialChannelId: string;
}): Promise<PlatformPayload | null> {
  const allowed = await hasWorkspaceRole({ id: input.actor.id }, input.workspaceId, [
    "workspace_manager",
    "content_planner",
    "designer",
    "internal_reviewer",
    "client_reviewer",
    "publisher",
    "viewer",
  ]);
  if (!allowed) {
    throw new PlatformPayloadError("FORBIDDEN", "Not a member of this workspace.", {
      workspaceId: input.workspaceId,
    });
  }
  await ensureContentItemChannelInWorkspace(
    input.contentItemId,
    input.socialChannelId,
    input.workspaceId,
  );
  const [row] = await db
    .select({ platformPayload: contentItemChannels.platformPayload })
    .from(contentItemChannels)
    .innerJoin(contentItems, eq(contentItems.id, contentItemChannels.contentItemId))
    .where(
      and(
        eq(contentItemChannels.contentItemId, input.contentItemId),
        eq(contentItemChannels.socialChannelId, input.socialChannelId),
        eq(contentItems.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new PlatformPayloadError(
      "NOT_FOUND",
      "Content item channel row disappeared between checks.",
      { contentItemId: input.contentItemId, socialChannelId: input.socialChannelId },
    );
  }
  const raw = row.platformPayload;
  if (!raw) return null;
  // The discriminator tag may not be present if a v0 row was
  // written before the discriminated union. Treat that as
  // "no payload" rather than throwing — the readiness service
  // will surface a blocker for the channel.
  const candidate = raw as { platform?: string };
  if (!candidate.platform) return null;
  return PlatformPayloadSchema.parse(raw);
}

/**
 * Read every channel payload for a content item, indexed by
 * `socialChannelId`. The page-level publish UI calls this to
 * render the package in one query.
 */
export async function readAllChannelPayloads(input: {
  actor: Actor;
  workspaceId: string;
  contentItemId: string;
}): Promise<Record<string, PlatformPayload | null>> {
  const allowed = await hasWorkspaceRole({ id: input.actor.id }, input.workspaceId, [
    "workspace_manager",
    "content_planner",
    "designer",
    "internal_reviewer",
    "client_reviewer",
    "publisher",
    "viewer",
  ]);
  if (!allowed) {
    throw new PlatformPayloadError("FORBIDDEN", "Not a member of this workspace.", {
      workspaceId: input.workspaceId,
    });
  }
  const rows = await db
    .select({
      socialChannelId: contentItemChannels.socialChannelId,
      platformPayload: contentItemChannels.platformPayload,
    })
    .from(contentItemChannels)
    .innerJoin(contentItems, eq(contentItems.id, contentItemChannels.contentItemId))
    .where(
      and(
        eq(contentItemChannels.contentItemId, input.contentItemId),
        eq(contentItems.workspaceId, input.workspaceId),
      ),
    );
  const out: Record<string, PlatformPayload | null> = {};
  for (const row of rows) {
    const raw = row.platformPayload;
    if (!raw) {
      out[row.socialChannelId] = null;
      continue;
    }
    const candidate = raw as { platform?: string };
    if (!candidate.platform) {
      out[row.socialChannelId] = null;
      continue;
    }
    out[row.socialChannelId] = PlatformPayloadSchema.parse(raw);
  }
  return out;
}

export type ChannelPayloadState = {
  payload: PlatformPayload | null;
  copySourceRevision: number | null;
};

/** Read payload plus the shared-copy revision it was saved against. */
export async function readAllChannelPayloadStates(input: {
  actor: Actor;
  workspaceId: string;
  contentItemId: string;
}): Promise<Record<string, ChannelPayloadState>> {
  const allowed = await hasWorkspaceRole({ id: input.actor.id }, input.workspaceId, [
    "workspace_manager",
    "content_planner",
    "designer",
    "internal_reviewer",
    "client_reviewer",
    "publisher",
    "viewer",
  ]);
  if (!allowed) {
    throw new PlatformPayloadError("FORBIDDEN", "Not a member of this workspace.", {
      workspaceId: input.workspaceId,
    });
  }
  const rows = await db
    .select({
      socialChannelId: contentItemChannels.socialChannelId,
      platformPayload: contentItemChannels.platformPayload,
      copySourceRevision: contentItemChannels.copySourceRevision,
    })
    .from(contentItemChannels)
    .innerJoin(contentItems, eq(contentItems.id, contentItemChannels.contentItemId))
    .where(
      and(
        eq(contentItemChannels.contentItemId, input.contentItemId),
        eq(contentItems.workspaceId, input.workspaceId),
      ),
    );
  const out: Record<string, ChannelPayloadState> = {};
  for (const row of rows) {
    const raw = row.platformPayload as { platform?: string } | null;
    out[row.socialChannelId] = {
      payload: raw?.platform ? PlatformPayloadSchema.parse(raw) : null,
      copySourceRevision: row.copySourceRevision,
    };
  }
  return out;
}

/**
 * Reset a single channel's payload back to the empty shape.
 * Used by the materiality service when a content-item-level
 * approval reset cascades to the channel. (The channel row
 * itself is never deleted — the linkage stays so the publish
 * UI knows the channel is still selected.)
 */
export async function clearChannelPayload(input: {
  actor: Actor;
  workspaceId: string;
  contentItemId: string;
  socialChannelId: string;
}): Promise<void> {
  const allowed = await hasWorkspaceRole({ id: input.actor.id }, input.workspaceId, [
    "workspace_manager",
    "content_planner",
  ]);
  if (!allowed) {
    throw new PlatformPayloadError("FORBIDDEN", "Forbidden.", { workspaceId: input.workspaceId });
  }
  await db
    .update(contentItemChannels)
    .set({ platformPayload: sql`NULL`, updatedAt: new Date() })
    .where(
      and(
        eq(contentItemChannels.contentItemId, input.contentItemId),
        eq(contentItemChannels.socialChannelId, input.socialChannelId),
      ),
    );
  const materiality = await recordMaterialityEvent({
    actor: input.actor,
    contentItemId: input.contentItemId,
    resource: MATERIAL_RESOURCE_PLATFORM_PAYLOAD,
    beforeValue: "(payload)",
    afterValue: null,
    reasonCode: "platform_payload.clear",
  });
  await db
    .update(contentItemChannels)
    .set({ copySourceRevision: materiality.revision, updatedAt: new Date() })
    .where(
      and(
        eq(contentItemChannels.contentItemId, input.contentItemId),
        eq(contentItemChannels.socialChannelId, input.socialChannelId),
      ),
    );
}
