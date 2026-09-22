import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  activityEvents,
  contentItemChannels,
  contentItems,
  publicationRecords,
  socialChannels,
  socialConnections,
  workspaces,
} from "@/lib/db/schema";
import {
  hasWorkspaceRole,
  PermissionDeniedError,
  requirePolicy,
  type Actor,
} from "@/lib/auth/policy";
import { getAgencyProviderConfig } from "./provider-config";
import { createDekCache, getDekForWorkspace } from "./key-management";
import { openConnectionCredentials, updateConnectionCredentials } from "./repository";
import { fetchMetaPublicationById, fetchMetaPublicationCandidatesPage } from "./providers/meta";
import { isSocialProviderError } from "./http";
import { rankMetaPublicationCandidates, type MetaPublicationCandidate } from "./meta-publications";

export type ExternalPublicationStatus = "scheduled" | "published" | "unavailable" | "error";

export function externalPublicationStatusFromCandidate(
  candidate: MetaPublicationCandidate,
): Exclude<ExternalPublicationStatus, "unavailable" | "error"> {
  return candidate.status;
}

export function externalPublicationSnapshot(
  candidate: MetaPublicationCandidate,
): Record<string, string | null> {
  return {
    id: candidate.id,
    platform: candidate.platform,
    status: candidate.status,
    caption: candidate.caption,
    mediaType: candidate.mediaType,
    permalink: candidate.permalink,
    thumbnailUrl: candidate.thumbnailUrl,
    createdAt: candidate.createdAt?.toISOString() ?? null,
    scheduledAt: candidate.scheduledAt?.toISOString() ?? null,
    publishedAt: candidate.publishedAt?.toISOString() ?? null,
  };
}

export type MetaPublicationLinkErrorCode =
  | "channel_not_found"
  | "forbidden"
  | "not_meta_channel"
  | "connection_unavailable"
  | "provider_not_configured"
  | "permission_denied"
  | "auth_expired"
  | "provider_unavailable"
  | "publication_not_found"
  | "duplicate_link"
  | "invalid_candidate"
  | "invalid_state";

export class MetaPublicationLinkError extends Error {
  constructor(public readonly code: MetaPublicationLinkErrorCode) {
    super(code);
    this.name = "MetaPublicationLinkError";
  }
}

type MetaChannelContext = {
  contentItemId: string;
  workspaceId: string;
  agencyId: string;
  contentStatus: string;
  channelId: string;
  platform: "facebook" | "instagram";
  externalAccountId: string;
  connection: typeof socialConnections.$inferSelect;
  appCredentials: { appId: string; appSecret: string; graphApiVersion: string | null };
};

async function loadMetaChannelContext(
  actor: Actor,
  contentItemChannelId: string,
  mode: "read" | "write" | "internal",
  expectedWorkspaceId?: string,
): Promise<MetaChannelContext> {
  const [row] = await db
    .select({
      contentItemId: contentItemChannels.contentItemId,
      workspaceId: contentItems.workspaceId,
      contentStatus: contentItems.status,
      agencyId: workspaces.agencyId,
      channelId: socialChannels.id,
      platform: socialChannels.platform,
      externalAccountId: socialChannels.externalAccountId,
      connectionStatus: socialChannels.connectionStatus,
      connection: socialConnections,
    })
    .from(contentItemChannels)
    .innerJoin(contentItems, eq(contentItems.id, contentItemChannels.contentItemId))
    .innerJoin(workspaces, eq(workspaces.id, contentItems.workspaceId))
    .innerJoin(socialChannels, eq(socialChannels.id, contentItemChannels.socialChannelId))
    .leftJoin(socialConnections, eq(socialConnections.id, socialChannels.socialConnectionId))
    .where(eq(contentItemChannels.id, contentItemChannelId))
    .limit(1);

  if (!row) throw new MetaPublicationLinkError("channel_not_found");
  if (expectedWorkspaceId && row.workspaceId !== expectedWorkspaceId) {
    throw new MetaPublicationLinkError("channel_not_found");
  }
  if (mode !== "internal") {
    const allowed = await hasWorkspaceRole(
      actor,
      row.workspaceId,
      mode === "write"
        ? ["publisher", "workspace_manager"]
        : [
            "publisher",
            "workspace_manager",
            "content_planner",
            "designer",
            "internal_reviewer",
            "viewer",
          ],
    );
    await requirePolicy(Promise.resolve(allowed), "link_meta_publication");
  }
  if (row.platform !== "facebook" && row.platform !== "instagram") {
    throw new MetaPublicationLinkError("not_meta_channel");
  }
  if (!row.externalAccountId || row.connectionStatus !== "connected" || !row.connection) {
    throw new MetaPublicationLinkError("connection_unavailable");
  }
  if (row.connection.provider !== "meta" || row.connection.revokedAt) {
    throw new MetaPublicationLinkError("connection_unavailable");
  }
  const config = await getAgencyProviderConfig(db, row.agencyId, "meta");
  if ("errorCode" in config) throw new MetaPublicationLinkError("provider_not_configured");
  if (!config.enabled) throw new MetaPublicationLinkError("provider_not_configured");

  return {
    contentItemId: row.contentItemId,
    workspaceId: row.workspaceId,
    agencyId: row.agencyId,
    contentStatus: row.contentStatus,
    channelId: row.channelId,
    platform: row.platform,
    externalAccountId: row.externalAccountId,
    connection: row.connection,
    appCredentials: {
      appId: config.appId,
      appSecret: config.appSecret,
      graphApiVersion: config.graphApiVersion,
    },
  };
}

async function credentialsFor(
  context: MetaChannelContext,
  now: Date,
): Promise<{
  credentials: Parameters<typeof fetchMetaPublicationCandidatesPage>[0]["credentials"];
}> {
  const dek = await getDekForWorkspace(db, createDekCache(db), context.workspaceId);
  let credentials = openConnectionCredentials(context.connection, dek);
  if (
    context.connection.accessTokenExpiresAt &&
    context.connection.accessTokenExpiresAt.getTime() - now.getTime() < 5 * 60_000
  ) {
    try {
      const refreshed = await (
        await import("./providers/meta")
      ).metaAdapter.refreshCredentials(credentials, context.appCredentials);
      credentials = refreshed.credentials;
      await updateConnectionCredentials(
        db,
        context.connection.id,
        credentials,
        refreshed.accessTokenExpiresAt,
        refreshed.refreshTokenExpiresAt,
      );
    } catch (error) {
      if (isSocialProviderError(error)) {
        if (error.code === "permission_denied") {
          await markMetaConnectionNeedsReauth(context, error.code);
          throw new MetaPublicationLinkError("permission_denied");
        }
        if (error.code === "auth_expired") {
          await markMetaConnectionNeedsReauth(context, error.code);
          throw new MetaPublicationLinkError("auth_expired");
        }
        if (error.code === "provider_unavailable") {
          throw new MetaPublicationLinkError("provider_unavailable");
        }
      }
      throw error;
    }
  }
  return { credentials };
}

async function markMetaConnectionNeedsReauth(
  context: MetaChannelContext,
  errorCode: "permission_denied" | "auth_expired",
) {
  const now = new Date();
  await db
    .update(socialChannels)
    .set({
      connectionStatus: "needs_reauth",
      lastSyncErrorCode: errorCode,
      lastSyncErrorAt: now,
      updatedAt: now,
    })
    .where(eq(socialChannels.id, context.channelId));
  await db
    .update(socialConnections)
    .set({ status: "needs_reauth", updatedAt: now })
    .where(eq(socialConnections.id, context.connection.id));
  await db.insert(activityEvents).values({
    workspaceId: context.workspaceId,
    contentItemId: context.contentItemId,
    actorId: null,
    kind: "publication",
    summary: "Meta reauthorization is required for publication linking",
    beforeData: {},
    afterData: { connectionStatus: "needs_reauth", errorCode },
    metadata: { event: "meta_publication_permission_failure", channelId: context.channelId },
  });
}

function mapProviderError(error: unknown): MetaPublicationLinkError {
  if (error instanceof PermissionDeniedError) {
    return new MetaPublicationLinkError("forbidden");
  }
  if (isSocialProviderError(error)) {
    if (error.code === "not_found") return new MetaPublicationLinkError("publication_not_found");
    if (error.code === "permission_denied")
      return new MetaPublicationLinkError("permission_denied");
    if (error.code === "auth_expired") return new MetaPublicationLinkError("auth_expired");
    if (error.code === "provider_unavailable" || error.code === "rate_limited") {
      return new MetaPublicationLinkError("provider_unavailable");
    }
  }
  return new MetaPublicationLinkError("provider_unavailable");
}

export function isMetaPublicationUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const candidate = error as { code?: unknown; constraint?: unknown; message?: unknown };
  return (
    candidate.code === "23505" &&
    (candidate.constraint === "publication_record_external_post_unique" ||
      (typeof candidate.message === "string" &&
        candidate.message.includes("publication_record_external_post_unique")))
  );
}

export async function listMetaPublicationCandidates(
  actor: Actor,
  input: {
    workspaceId: string;
    contentItemChannelId: string;
    publishedSince?: Date;
    after?: string;
    targetDate?: Date | null;
    searchText?: string | null;
  },
) {
  const context = await loadMetaChannelContext(
    actor,
    input.contentItemChannelId,
    "read",
    input.workspaceId,
  );
  const now = new Date();
  const { credentials } = await credentialsFor(context, now);
  let page;
  try {
    page = await fetchMetaPublicationCandidatesPage({
      platform: context.platform,
      accountId: context.externalAccountId,
      credentials,
      apiVersion: context.appCredentials.graphApiVersion,
      publishedSince: input.publishedSince ?? new Date(now.getTime() - 90 * 24 * 60 * 60_000),
      ...(input.after ? { after: input.after } : {}),
      now,
    });
  } catch (error) {
    throw mapProviderError(error);
  }
  return {
    ...page,
    candidates: rankMetaPublicationCandidates(page.candidates, {
      targetDate: input.targetDate ?? now,
      ...(input.searchText ? { searchText: input.searchText } : {}),
    }),
  };
}

export async function linkMetaPublication(
  actor: Actor,
  input: { workspaceId: string; contentItemChannelId: string; externalPostId: string },
) {
  const context = await loadMetaChannelContext(
    actor,
    input.contentItemChannelId,
    "write",
    input.workspaceId,
  );
  if (!(
    "ready_to_publish" === context.contentStatus ||
    "partially_published" === context.contentStatus ||
    "published" === context.contentStatus
  )) {
    throw new MetaPublicationLinkError("invalid_state");
  }
  const { credentials } = await credentialsFor(context, new Date());
  let candidate: MetaPublicationCandidate | null;
  try {
    candidate = await fetchMetaPublicationById({
      platform: context.platform,
      accountId: context.externalAccountId,
      publicationId: input.externalPostId,
      credentials,
      apiVersion: context.appCredentials.graphApiVersion,
    });
  } catch (error) {
    throw mapProviderError(error);
  }
  if (!candidate) throw new MetaPublicationLinkError("publication_not_found");
  return persistLinkedCandidate(actor, context, input.contentItemChannelId, candidate);
}

async function persistLinkedCandidate(
  actor: Actor | null,
  context: MetaChannelContext,
  contentItemChannelId: string,
  candidate: MetaPublicationCandidate,
  event: "linked" | "refreshed" | "reconciled" = "linked",
) {
  const now = new Date();
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM content_item WHERE id = ${context.contentItemId} FOR UPDATE`,
      );
      const [existingLink] = await tx
        .select({
          id: publicationRecords.id,
          contentItemChannelId: publicationRecords.contentItemChannelId,
        })
        .from(publicationRecords)
        .where(
          and(
            eq(publicationRecords.externalProvider, "meta"),
            eq(publicationRecords.externalPostId, candidate.id),
          ),
        )
        .limit(1);
      if (existingLink && existingLink.contentItemChannelId !== contentItemChannelId) {
        throw new MetaPublicationLinkError("duplicate_link");
      }

      const [existing] = await tx
        .select()
        .from(publicationRecords)
        .where(eq(publicationRecords.contentItemChannelId, contentItemChannelId))
        .limit(1);
      const externalStatus = externalPublicationStatusFromCandidate(candidate);
      const update: Record<string, unknown> = {
        externalProvider: "meta",
        externalPostId: candidate.id,
        externalStatus,
        externalPermalink: candidate.permalink,
        externalScheduledAt: candidate.scheduledAt,
        externalPublishedAt: candidate.publishedAt,
        externalLastSeenAt: now,
        externalLastSyncedAt: now,
        externalErrorCode: null,
        externalSnapshot: externalPublicationSnapshot(candidate),
        externalLinkedBy: actor?.id ?? null,
        externalLinkedAt: now,
        updatedAt: now,
      };
      if (externalStatus === "published") {
        Object.assign(update, {
          status: "published",
          actualPublishedAt: candidate.publishedAt ?? now,
          publishedUrl: candidate.permalink,
          publisherId: actor?.id ?? existing?.publisherId ?? null,
          failureReason: null,
        });
      }
      let recordId = existing?.id;
      if (recordId) {
        await tx
          .update(publicationRecords)
          .set(update as never)
          .where(eq(publicationRecords.id, recordId));
      } else {
        const [inserted] = await tx
          .insert(publicationRecords)
          .values({
            contentItemChannelId,
            status: externalStatus === "published" ? "published" : "pending",
            ...(update as Record<string, unknown>),
          })
          .returning({ id: publicationRecords.id });
        recordId = inserted?.id;
      }
      if (!recordId) throw new MetaPublicationLinkError("invalid_state");

      if (externalStatus === "published") {
        const records = await tx
          .select({ status: publicationRecords.status })
          .from(publicationRecords)
          .innerJoin(
            contentItemChannels,
            eq(contentItemChannels.id, publicationRecords.contentItemChannelId),
          )
          .where(eq(contentItemChannels.contentItemId, context.contentItemId));
        const channels = await tx
          .select({ id: contentItemChannels.id })
          .from(contentItemChannels)
          .where(eq(contentItemChannels.contentItemId, context.contentItemId));
        const nextStatus = deriveExternalAggregate(
          channels.length,
          records.map((r) => r.status),
        );
        await tx
          .update(contentItems)
          .set({ status: nextStatus, updatedAt: now })
          .where(eq(contentItems.id, context.contentItemId));
      }
      const previousExternalStatus = existing?.externalStatus ?? null;
      const shouldRecordReconciliation =
        event !== "reconciled" || previousExternalStatus !== externalStatus;
      if (shouldRecordReconciliation) {
        await tx.insert(activityEvents).values({
          workspaceId: context.workspaceId,
          contentItemId: context.contentItemId,
          actorId: actor?.id ?? null,
          kind: "publication",
          summary: `Meta publication ${event === "linked" ? "linked" : event === "refreshed" ? "refreshed" : "reconciled"}${externalStatus === "published" ? " and confirmed" : ""}`,
          beforeData: {
            externalProvider: existing?.externalProvider ?? null,
            externalPostId: existing?.externalPostId ?? null,
            externalStatus: previousExternalStatus,
          },
          afterData: { externalProvider: "meta", externalPostId: candidate.id, externalStatus },
          metadata: { contentItemChannelId, event: `meta_publication_${event}` },
        });
      }
      return { contentItemId: context.contentItemId, recordId, candidate };
    });
  } catch (error) {
    if (isMetaPublicationUniqueViolation(error)) {
      throw new MetaPublicationLinkError("duplicate_link");
    }
    throw error;
  }
}

function deriveExternalAggregate(count: number, statuses: string[]) {
  if (
    count > 0 &&
    statuses.length === count &&
    statuses.every((s) => s === "published" || s === "skipped")
  )
    return "published" as const;
  if (statuses.some((s) => s === "published" || s === "skipped"))
    return "partially_published" as const;
  return "ready_to_publish" as const;
}

export async function refreshMetaPublicationLink(
  actor: Actor,
  workspaceId: string,
  contentItemChannelId: string,
) {
  const context = await loadMetaChannelContext(actor, contentItemChannelId, "write", workspaceId);
  const [record] = await db
    .select()
    .from(publicationRecords)
    .where(eq(publicationRecords.contentItemChannelId, contentItemChannelId))
    .limit(1);
  if (!record?.externalPostId) throw new MetaPublicationLinkError("invalid_state");
  const { credentials } = await credentialsFor(context, new Date());
  try {
    const candidate = await fetchMetaPublicationById({
      platform: context.platform,
      accountId: context.externalAccountId,
      publicationId: record.externalPostId,
      credentials,
      apiVersion: context.appCredentials.graphApiVersion,
    });
    if (!candidate) throw new MetaPublicationLinkError("publication_not_found");
    return persistLinkedCandidate(actor, context, contentItemChannelId, candidate, "refreshed");
  } catch (error) {
    const mapped = error instanceof MetaPublicationLinkError ? error : mapProviderError(error);
    if (mapped.code === "publication_not_found") {
      const now = new Date();
      await db
        .update(publicationRecords)
        .set({
          externalStatus: "unavailable",
          externalLastSyncedAt: now,
          externalErrorCode: "not_found",
          updatedAt: now,
        })
        .where(eq(publicationRecords.id, record.id));
      await db.insert(activityEvents).values({
        workspaceId: context.workspaceId,
        contentItemId: context.contentItemId,
        actorId: actor.id,
        kind: "publication",
        summary: "Linked Meta publication is unavailable",
        beforeData: {},
        afterData: { externalPostId: record.externalPostId, externalStatus: "unavailable" },
        metadata: { contentItemChannelId, event: "meta_publication_unavailable" },
      });
      return {
        contentItemId: context.contentItemId,
        recordId: record.id,
        candidate: null,
        unavailable: true,
      };
    }
    const now = new Date();
    if (mapped.code === "permission_denied" || mapped.code === "auth_expired") {
      await markMetaConnectionNeedsReauth(context, mapped.code);
    }
    await db
      .update(publicationRecords)
      .set({
        externalStatus: "error",
        externalLastSyncedAt: now,
        externalErrorCode: mapped.code,
        updatedAt: now,
      })
      .where(eq(publicationRecords.id, record.id));
    await db.insert(activityEvents).values({
      workspaceId: context.workspaceId,
      contentItemId: context.contentItemId,
      actorId: actor.id,
      kind: "publication",
      summary: "Meta publication refresh failed",
      beforeData: { externalPostId: record.externalPostId },
      afterData: { externalStatus: "error", errorCode: mapped.code },
      metadata: { contentItemChannelId, event: "meta_publication_refresh_failed" },
    });
    throw mapped;
  }
}

export async function unlinkMetaPublication(
  actor: Actor,
  workspaceId: string,
  contentItemChannelId: string,
) {
  const context = await loadMetaChannelContext(actor, contentItemChannelId, "write", workspaceId);
  const [record] = await db
    .select()
    .from(publicationRecords)
    .where(eq(publicationRecords.contentItemChannelId, contentItemChannelId))
    .limit(1);
  if (!record?.externalPostId) throw new MetaPublicationLinkError("invalid_state");
  const now = new Date();
  await db
    .update(publicationRecords)
    .set({
      externalProvider: null,
      externalPostId: null,
      externalStatus: null,
      externalPermalink: null,
      externalScheduledAt: null,
      externalPublishedAt: null,
      externalLastSeenAt: null,
      externalLastSyncedAt: now,
      externalErrorCode: null,
      externalSnapshot: {},
      externalLinkedBy: null,
      externalLinkedAt: null,
      updatedAt: now,
    })
    .where(eq(publicationRecords.id, record.id));
  await db.insert(activityEvents).values({
    workspaceId: context.workspaceId,
    contentItemId: context.contentItemId,
    actorId: actor.id,
    kind: "publication",
    summary: "Meta publication unlinked",
    beforeData: { externalPostId: record.externalPostId },
    afterData: {},
    metadata: { contentItemChannelId, event: "meta_publication_unlinked" },
  });
  return { contentItemId: context.contentItemId };
}

export async function reconcileMetaPublicationLinks(now = new Date()) {
  const rows = await db
    .select({
      record: {
        id: publicationRecords.id,
        contentItemChannelId: publicationRecords.contentItemChannelId,
        externalPostId: publicationRecords.externalPostId,
        externalLinkedBy: publicationRecords.externalLinkedBy,
      },
      context: {
        contentItemId: contentItemChannels.contentItemId,
        workspaceId: contentItems.workspaceId,
        agencyId: workspaces.agencyId,
        platform: socialChannels.platform,
        externalAccountId: socialChannels.externalAccountId,
        status: contentItems.status,
      },
    })
    .from(publicationRecords)
    .innerJoin(
      contentItemChannels,
      eq(contentItemChannels.id, publicationRecords.contentItemChannelId),
    )
    .innerJoin(contentItems, eq(contentItems.id, contentItemChannels.contentItemId))
    .innerJoin(workspaces, eq(workspaces.id, contentItems.workspaceId))
    .innerJoin(socialChannels, eq(socialChannels.id, contentItemChannels.socialChannelId))
    .innerJoin(socialConnections, eq(socialConnections.id, socialChannels.socialConnectionId))
    .where(
      and(
        eq(publicationRecords.externalProvider, "meta"),
        eq(publicationRecords.externalStatus, "scheduled"),
      ),
    );
  for (const row of rows) {
    try {
      const actor = row.record.externalLinkedBy ? { id: row.record.externalLinkedBy } : null;
      const context = await loadMetaChannelContext(
        actor ?? { id: "00000000-0000-0000-0000-000000000000" },
        row.record.contentItemChannelId,
        "internal",
        row.context.workspaceId,
      );
      const { credentials } = await credentialsFor(context, now);
      const candidate = await fetchMetaPublicationById({
        platform: context.platform,
        accountId: context.externalAccountId!,
        publicationId: row.record.externalPostId!,
        credentials,
        apiVersion: context.appCredentials.graphApiVersion,
        now,
      });
      if (candidate) {
        await persistLinkedCandidate(
          actor,
          context,
          row.record.contentItemChannelId,
          candidate,
          "reconciled",
        );
      } else {
        await db
          .update(publicationRecords)
          .set({
            externalStatus: "unavailable",
            externalLastSyncedAt: now,
            externalErrorCode: "not_found",
            updatedAt: now,
          })
          .where(eq(publicationRecords.id, row.record.id));
        await db.insert(activityEvents).values({
          workspaceId: row.context.workspaceId,
          contentItemId: row.context.contentItemId,
          actorId: row.record.externalLinkedBy,
          kind: "publication",
          summary: "Linked Meta publication is unavailable",
          beforeData: { externalPostId: row.record.externalPostId },
          afterData: { externalStatus: "unavailable" },
          metadata: {
            contentItemChannelId: row.record.contentItemChannelId,
            event: "meta_publication_unavailable",
          },
        });
      }
    } catch (error) {
      if (isSocialProviderError(error) && error.code === "not_found") {
        await db
          .update(publicationRecords)
          .set({
            externalStatus: "unavailable",
            externalLastSyncedAt: now,
            externalErrorCode: "not_found",
            updatedAt: now,
          })
          .where(eq(publicationRecords.id, row.record.id));
        await db.insert(activityEvents).values({
          workspaceId: row.context.workspaceId,
          contentItemId: row.context.contentItemId,
          actorId: row.record.externalLinkedBy,
          kind: "publication",
          summary: "Linked Meta publication is unavailable",
          beforeData: { externalPostId: row.record.externalPostId },
          afterData: { externalStatus: "unavailable" },
          metadata: {
            contentItemChannelId: row.record.contentItemChannelId,
            event: "meta_publication_unavailable",
          },
        });
      } else {
        const errorCode = isSocialProviderError(error) ? error.code : "provider_unavailable";
        await db
          .update(publicationRecords)
          .set({
            externalStatus: "error",
            externalLastSyncedAt: now,
            externalErrorCode: errorCode,
            updatedAt: now,
          })
          .where(eq(publicationRecords.id, row.record.id));
        await db.insert(activityEvents).values({
          workspaceId: row.context.workspaceId,
          contentItemId: row.context.contentItemId,
          actorId: row.record.externalLinkedBy,
          kind: "publication",
          summary: "Meta publication reconciliation failed",
          beforeData: {
            externalPostId: row.record.externalPostId,
            externalStatus: "scheduled",
          },
          afterData: { externalStatus: "error", errorCode },
          metadata: {
            contentItemChannelId: row.record.contentItemChannelId,
            event: "meta_publication_reconcile_failed",
          },
        });
      }
    }
  }
  return rows.length;
}
