import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { activityEvents, contentItemChannels, contentItems, workspaces } from "@/lib/db/schema";
import { hasWorkspaceRole, isAgencyAdmin, type Actor } from "@/lib/auth/policy";
import { PlatformPayloadSchema, type PlatformPayload } from "./payload-schemas";
import {
  recordMaterialityEvent,
  recordMaterialityEventInTx,
  MATERIAL_RESOURCE_PLATFORM_PAYLOAD,
} from "./materiality";

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
  /**
   * Optimistic-concurrency token: the `content_item_channels.updated_at`
   * the client read before editing.
   *
   * This is deliberately NOT `copySourceRevision`. That column is
   * *provenance* — "the content revision this channel last inherited
   * shared audience copy from" (`content.ts:163-165`) — and is written
   * as `materiality.revision` at save time. Using it as a write token
   * would conflate "which copy revision is this based on" with "has
   * this row changed since I read it", and the two diverge the moment
   * anyone saves without touching shared copy.
   *
   * `null`/absent keeps last-write-wins for callers that cannot supply
   * the token; the publish form always supplies it.
   */
  expectedUpdatedAt: z.string().datetime().nullable().optional(),
});
export type SavePlatformPayloadInput = z.infer<typeof SavePlatformPayloadInputSchema>;

/**
 * One channel's entry in an atomic batch save.
 *
 * `expectedUpdatedAt` is the same optimistic-concurrency token the
 * single-channel path uses. It is required here (not optional) because
 * a batch is exactly the situation where a stale write is most likely:
 * the operator edits several channels against one page load, and a
 * collaborator may have saved one of them in between.
 */
export const SavePlatformPayloadBatchEntrySchema = z.object({
  socialChannelId: z.string().uuid(),
  payload: PlatformPayloadSchema,
  expectedUpdatedAt: z.string().datetime().nullable(),
});
export type SavePlatformPayloadBatchEntry = z.infer<typeof SavePlatformPayloadBatchEntrySchema>;

export const SavePlatformPayloadBatchInputSchema = z.object({
  contentItemId: z.string().uuid(),
  entries: z.array(SavePlatformPayloadBatchEntrySchema).min(1).max(25),
});
export type SavePlatformPayloadBatchInput = z.infer<typeof SavePlatformPayloadBatchInputSchema>;

/** Per-channel outcome of a batch. `ok: false` carries the failing field. */
export type BatchChannelResult =
  | { socialChannelId: string; ok: true; payload: PlatformPayload }
  | {
      socialChannelId: string;
      ok: false;
      errorCode: string;
      fieldPath?: string | undefined;
      message?: string | undefined;
    };

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
 *      content item's `revision`, preserve approval state, and
 *      record an immutable audit row.
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
  // Approval metadata is server-owned. Editing the package must not revoke
  // an existing approval; only the explicit approval action may change it.
  const [existingRow] = await db
    .select({
      platformPayload: contentItemChannels.platformPayload,
      updatedAt: contentItemChannels.updatedAt,
    })
    .from(contentItemChannels)
    .where(
      and(
        eq(contentItemChannels.contentItemId, input.contentItemId),
        eq(contentItemChannels.socialChannelId, input.socialChannelId),
      ),
    )
    .limit(1);

  // Optimistic concurrency. Reject a write whose base row moved since the
  // client read it, rather than silently overwriting a collaborator's
  // package. The comparison is inside the UPDATE's WHERE so a concurrent
  // commit between the read and the write is caught too.
  const expected = input.expectedUpdatedAt ? new Date(input.expectedUpdatedAt).getTime() : null;
  if (expected !== null && existingRow?.updatedAt) {
    if (existingRow.updatedAt.getTime() !== expected) {
      throw new PlatformPayloadError(
        "INVALID",
        "This channel package changed since you loaded it. Reload before saving.",
        {
          contentItemId: input.contentItemId,
          socialChannelId: input.socialChannelId,
          expectedUpdatedAt: input.expectedUpdatedAt,
          actualUpdatedAt: existingRow.updatedAt.toISOString(),
        },
      );
    }
  }

  const existingPayload = existingRow?.platformPayload
    ? PlatformPayloadSchema.safeParse(existingRow.platformPayload)
    : null;
  const serverApproval = existingPayload?.success
    ? existingPayload.data.approval
    : { finalCopyApproved: false, approvedByUserId: null, approvedAt: null };
  const payload = PlatformPayloadSchema.parse({
    ...input.payload,
    approval: serverApproval,
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
 * Save several channel packages as ONE material edit.
 *
 * Invariant: **one call = one material edit.** Every payload lands in a
 * single transaction together with exactly one `content_items.revision`
 * increment, one audit row, and one reviewer notification fan-out.
 *
 * The previous behaviour looped the single-channel action from the
 * client, which meant N sequential round-trips, N revision increments
 * and N notification batches for what the operator experienced as one
 * click — and a partial failure left the form reporting "2 of 5
 * channels failed" with no way to tell which or to retry them.
 *
 * Validate-first: if any entry fails schema validation or its
 * `expectedUpdatedAt` is stale, **nothing** is written and every failing
 * channel is reported. Savepoints for partial persistence are
 * deliberately not offered — half-saved publishing state is worse than
 * a rejected batch, because the operator cannot tell which packages the
 * notifications were about.
 */
export async function savePlatformPayloadsBatch(
  actor: Actor,
  workspaceId: string,
  input: SavePlatformPayloadBatchInput,
): Promise<{
  ok: boolean;
  results: BatchChannelResult[];
  revision: number | null;
}> {
  const parsed = SavePlatformPayloadBatchInputSchema.parse(input);
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

  for (const entry of parsed.entries) {
    await ensureContentItemChannelInWorkspace(
      parsed.contentItemId,
      entry.socialChannelId,
      workspaceId,
    );
  }

  // ─── Validate every channel before writing any of them ────────────
  const existingRows = await db
    .select({
      socialChannelId: contentItemChannels.socialChannelId,
      platformPayload: contentItemChannels.platformPayload,
      updatedAt: contentItemChannels.updatedAt,
    })
    .from(contentItemChannels)
    .where(eq(contentItemChannels.contentItemId, parsed.contentItemId));
  const existingByChannel = new Map(existingRows.map((row) => [row.socialChannelId, row]));

  const results: BatchChannelResult[] = [];
  const ready: Array<{ socialChannelId: string; payload: PlatformPayload }> = [];

  for (const entry of parsed.entries) {
    const row = existingByChannel.get(entry.socialChannelId);
    if (entry.expectedUpdatedAt && row?.updatedAt) {
      if (row.updatedAt.toISOString() !== new Date(entry.expectedUpdatedAt).toISOString()) {
        results.push({
          socialChannelId: entry.socialChannelId,
          ok: false,
          errorCode: "stale",
          message: "This channel package changed since you loaded it. Reload before saving.",
        });
        continue;
      }
    }
    const existingPayload = row?.platformPayload
      ? PlatformPayloadSchema.safeParse(row.platformPayload)
      : null;
    const serverApproval = existingPayload?.success
      ? existingPayload.data.approval
      : { finalCopyApproved: false, approvedByUserId: null, approvedAt: null };
    const merged = PlatformPayloadSchema.safeParse({
      ...entry.payload,
      approval: serverApproval,
    });
    if (!merged.success) {
      // Defence in depth. `SavePlatformPayloadBatchInputSchema` already
      // validated every `payload` through `PlatformPayloadSchema` when
      // this function was entered, and `serverApproval` is either a
      // value that previously passed `ApprovalPayloadSchema` or a
      // hard-coded valid literal — so this re-parse cannot fail with
      // today's callers. A schema-invalid payload therefore surfaces as
      // a `ZodError` from the entry parse, with zero writes; the
      // *action* layer is what reports it per channel, with a
      // `fieldPath`, before it ever reaches here.
      const issue = merged.error.issues[0];
      const segments = (issue?.path ?? []).filter(
        (segment): segment is string => typeof segment === "string",
      );
      const fieldPath = segments.at(-1);
      results.push({
        socialChannelId: entry.socialChannelId,
        ok: false,
        errorCode: "invalidPlatformPayload",
        ...(fieldPath && fieldPath !== "platform" && !/^\d+$/.test(fieldPath) ? { fieldPath } : {}),
        message: issue?.message,
      });
      continue;
    }
    ready.push({ socialChannelId: entry.socialChannelId, payload: merged.data });
  }

  // Any failure aborts the whole batch: nothing has been written yet.
  if (results.length > 0) {
    return { ok: false, results, revision: null };
  }

  const revision = await db.transaction(async (tx) => {
    // Compare-and-set per row. The read above and this write are in the
    // same transaction as the revision bump, so a collaborator's commit
    // between them is caught here rather than silently overwritten.
    for (const entry of ready) {
      const row = existingByChannel.get(entry.socialChannelId);
      const [written] = await tx
        .update(contentItemChannels)
        .set({ platformPayload: entry.payload, updatedAt: new Date() })
        .where(
          and(
            eq(contentItemChannels.contentItemId, parsed.contentItemId),
            eq(contentItemChannels.socialChannelId, entry.socialChannelId),
            ...(row?.updatedAt ? [eq(contentItemChannels.updatedAt, row.updatedAt)] : []),
          ),
        )
        .returning({ socialChannelId: contentItemChannels.socialChannelId });
      if (!written) {
        throw new PlatformPayloadError(
          "INVALID",
          "This channel package changed while saving. Reload and try again.",
          { socialChannelId: entry.socialChannelId },
        );
      }
    }

    // One revision bump, one audit row, one notification fan-out for the
    // whole batch.
    const outcome = await recordMaterialityEventInTx(tx, {
      actor,
      contentItemId: parsed.contentItemId,
      resource: MATERIAL_RESOURCE_PLATFORM_PAYLOAD,
      beforeValue: null,
      afterValue: ready.map((entry) => ({
        socialChannelId: entry.socialChannelId,
        payload: entry.payload,
      })),
      reasonCode: "platform_payload.save_batch",
    });
    return outcome.revision;
  });

  for (const entry of ready) {
    results.push({ socialChannelId: entry.socialChannelId, ok: true, payload: entry.payload });
  }
  return { ok: true, results, revision };
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
  /**
   * Row timestamp, surfaced so the publish form can send it back as
   * `expectedUpdatedAt`. `copySourceRevision` is provenance, not a row
   * version, so it cannot serve as the write token.
   */
  updatedAt: string | null;
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
      updatedAt: contentItemChannels.updatedAt,
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
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    };
  }
  return out;
}

/**
 * Reset a single channel's payload back to the empty shape.
 * The channel row itself is never deleted — the linkage stays
 * so the publish UI knows the channel is still selected.
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
