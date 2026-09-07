import "server-only";
import { and, asc, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  mediaAssets,
  storageObjects,
  workspaceMembershipRoles,
  workspaceMemberships,
  workspaces,
} from "@/lib/db/schema";
import {
  canWriteToWorkspace,
  hasWorkspaceRole,
  isAgencyAdmin,
  isAgencyMember,
  type Actor,
} from "@/lib/auth/policy";
import {
  redactMediaSourceUrl,
  sanitizeAssetTitle,
  titleFromFilename,
  type MediaKind,
  type MediaSourceType,
} from "./contract";
import { fetchPublicMedia, MediaSourceError } from "./source";
import { MediaValidationError, validateStoredMediaObject } from "./validation";
import { quarantineMediaObject } from "./quarantine";
import {
  abortStorageUpload,
  completeStorageUpload,
  createStorageUploadIntent,
} from "@/lib/storage/intent-service";

const MEDIA_READ_ROLES = [
  "workspace_manager",
  "content_planner",
  "designer",
  "internal_reviewer",
  "publisher",
] as const;

export class MediaPermissionError extends Error {
  constructor(message = "You do not have permission to manage this media.") {
    super(message);
    this.name = "MediaPermissionError";
  }
}

type ListInput = {
  agencyId: string;
  workspaceId?: string;
  query?: string;
  kind?: string;
  includeTrashed?: boolean;
  limit?: number;
};

async function accessibleWorkspaceIds(actor: Actor, agencyId: string): Promise<string[]> {
  if (await isAgencyAdmin(actor, agencyId)) {
    const rows = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.agencyId, agencyId));
    return rows.map((row) => row.id);
  }
  const rows = await db
    .select({ id: workspaceMemberships.workspaceId })
    .from(workspaceMemberships)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
    .innerJoin(
      workspaceMembershipRoles,
      eq(workspaceMembershipRoles.workspaceMembershipId, workspaceMemberships.id),
    )
    .where(
      and(
        eq(workspaceMemberships.userId, actor.id),
        eq(workspaceMemberships.status, "active"),
        eq(workspaces.agencyId, agencyId),
        eq(workspaces.status, "active"),
        inArray(workspaceMembershipRoles.role, [...MEDIA_READ_ROLES]),
      ),
    );
  return [...new Set(rows.map((row) => row.id))];
}

export async function listMediaAssets(actor: Actor, input: ListInput) {
  if (!(await isAgencyMember(actor, input.agencyId))) return [];
  const accessibleIds = await accessibleWorkspaceIds(actor, input.agencyId);
  if (accessibleIds.length === 0) return [];
  if (input.workspaceId && !accessibleIds.includes(input.workspaceId)) return [];

  // A workspace view includes its own assets plus agency-shared assets from
  // the agency. The object is reused; this is a catalog visibility rule, not
  // a copy operation. The detail/download path applies the same agency-level
  // internal-role rule.
  const ownerScope = input.workspaceId
    ? or(eq(mediaAssets.ownerWorkspaceId, input.workspaceId), eq(mediaAssets.visibility, "agency"))
    : or(
        inArray(mediaAssets.ownerWorkspaceId, accessibleIds),
        eq(mediaAssets.visibility, "agency"),
      );

  const conditions = [
    eq(mediaAssets.agencyId, input.agencyId),
    ownerScope,
    input.includeTrashed
      ? inArray(mediaAssets.status, ["processing", "ready", "failed", "trashed"])
      : inArray(mediaAssets.status, ["processing", "ready", "failed"]),
  ];
  if (input.kind) conditions.push(eq(storageObjects.kind, input.kind));
  const query = input.query?.trim();
  if (query) {
    conditions.push(
      or(ilike(mediaAssets.title, `%${query}%`), ilike(storageObjects.originalName, `%${query}%`))!,
    );
  }

  return db
    .select({
      asset: mediaAssets,
      object: {
        id: storageObjects.id,
        originalName: storageObjects.originalName,
        mimeType: storageObjects.mimeType,
        byteSize: storageObjects.byteSize,
        width: storageObjects.width,
        height: storageObjects.height,
        durationMs: storageObjects.durationMs,
        kind: storageObjects.kind,
      },
      workspaceName: workspaces.name,
      workspaceSlug: workspaces.slug,
    })
    .from(mediaAssets)
    .innerJoin(storageObjects, eq(storageObjects.id, mediaAssets.storageObjectId))
    .innerJoin(workspaces, eq(workspaces.id, mediaAssets.ownerWorkspaceId))
    .where(and(...conditions))
    .orderBy(desc(mediaAssets.createdAt))
    .limit(Math.min(Math.max(input.limit ?? 60, 1), 100));
}

export type MediaDuplicateAdvisory = {
  assetId: string;
  title: string;
  ownerWorkspaceId: string;
  workspaceName: string;
  kind: MediaKind;
  mimeType: string;
  byteSize: number;
  sourceType: MediaSourceType;
  sameWorkspace: boolean;
};

/**
 * Return visible, ready assets with the same content checksum as a new
 * upload. This is advisory only: callers must still upload or explicitly
 * choose a future reuse/copy action. No source URLs or storage credentials
 * are exposed by this lookup.
 */
export async function findDuplicateMediaAssets(
  actor: Actor,
  input: { workspaceId: string; checksumSha256: string; kind: MediaKind; limit?: number },
): Promise<MediaDuplicateAdvisory[]> {
  if (!(await canWriteToWorkspace(actor, input.workspaceId))) {
    throw new MediaPermissionError("Read-only users cannot inspect upload duplicates.");
  }

  const [workspace] = await db
    .select({ agencyId: workspaces.agencyId })
    .from(workspaces)
    .where(and(eq(workspaces.id, input.workspaceId), eq(workspaces.status, "active")))
    .limit(1);
  if (!workspace) return [];

  const rows = await db
    .select({
      assetId: mediaAssets.id,
      title: mediaAssets.title,
      ownerWorkspaceId: mediaAssets.ownerWorkspaceId,
      workspaceName: workspaces.name,
      kind: storageObjects.kind,
      mimeType: storageObjects.mimeType,
      byteSize: storageObjects.byteSize,
      sourceType: mediaAssets.sourceType,
    })
    .from(mediaAssets)
    .innerJoin(storageObjects, eq(storageObjects.id, mediaAssets.storageObjectId))
    .innerJoin(workspaces, eq(workspaces.id, mediaAssets.ownerWorkspaceId))
    .where(
      and(
        eq(mediaAssets.agencyId, workspace.agencyId),
        eq(mediaAssets.status, "ready"),
        eq(mediaAssets.visibility, "agency"),
        eq(storageObjects.status, "active"),
        eq(storageObjects.kind, input.kind),
        eq(storageObjects.checksumSha256, input.checksumSha256),
        eq(workspaces.status, "active"),
      ),
    )
    .orderBy(desc(mediaAssets.createdAt))
    .limit(Math.min(Math.max(input.limit ?? 5, 1), 20));

  const sameWorkspaceRows = await db
    .select({
      assetId: mediaAssets.id,
      title: mediaAssets.title,
      ownerWorkspaceId: mediaAssets.ownerWorkspaceId,
      workspaceName: workspaces.name,
      kind: storageObjects.kind,
      mimeType: storageObjects.mimeType,
      byteSize: storageObjects.byteSize,
      sourceType: mediaAssets.sourceType,
    })
    .from(mediaAssets)
    .innerJoin(storageObjects, eq(storageObjects.id, mediaAssets.storageObjectId))
    .innerJoin(workspaces, eq(workspaces.id, mediaAssets.ownerWorkspaceId))
    .where(
      and(
        eq(mediaAssets.agencyId, workspace.agencyId),
        eq(mediaAssets.ownerWorkspaceId, input.workspaceId),
        eq(mediaAssets.status, "ready"),
        eq(storageObjects.status, "active"),
        eq(storageObjects.kind, input.kind),
        eq(storageObjects.checksumSha256, input.checksumSha256),
        eq(workspaces.status, "active"),
      ),
    )
    .orderBy(desc(mediaAssets.createdAt))
    .limit(Math.min(Math.max(input.limit ?? 5, 1), 20));

  const unique = new Map<string, (typeof rows)[number]>();
  for (const row of [...sameWorkspaceRows, ...rows]) unique.set(row.assetId, row);
  return [...unique.values()].slice(0, Math.min(Math.max(input.limit ?? 5, 1), 20)).map((row) => ({
    ...row,
    kind: row.kind as MediaKind,
    sourceType: row.sourceType as MediaSourceType,
    sameWorkspace: row.ownerWorkspaceId === input.workspaceId,
  }));
}

export async function registerUploadedMediaAsset(input: {
  actor: Actor;
  agencyId: string;
  workspaceId: string;
  storageObjectId: string;
  title: string;
  visibility?: "workspace" | "agency";
  sourceType?: MediaSourceType;
  sourceProvider?: string;
  sourceReference?: string;
  sourceUrl?: string;
  sourceModifiedAt?: Date;
}) {
  if (!(await canWriteToWorkspace(input.actor, input.workspaceId))) {
    throw new MediaPermissionError("Read-only users cannot add media.");
  }
  const [object] = await db
    .select()
    .from(storageObjects)
    .where(
      and(
        eq(storageObjects.id, input.storageObjectId),
        eq(storageObjects.agencyId, input.agencyId),
        eq(storageObjects.workspaceId, input.workspaceId),
        eq(storageObjects.status, "active"),
      ),
    )
    .limit(1);
  if (!object) throw new MediaPermissionError("The uploaded object is not available.");

  const [existing] = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(eq(mediaAssets.storageObjectId, input.storageObjectId))
    .limit(1);
  if (existing) return existing;

  const sourceType = input.sourceType ?? "browser_file";
  let status: "processing" | "ready" | "failed" = "processing";
  let failureCode: string | undefined = "validation_pending";
  let dimensions: { width: number; height: number } | null = null;
  if (sourceType === "legacy") {
    status = "ready";
    failureCode = undefined;
  } else {
    try {
      dimensions = await validateStoredMediaObject({
        agencyId: input.agencyId,
        workspaceId: input.workspaceId,
        objectId: object.id,
        contentType: object.mimeType,
      });
      status = "ready";
      failureCode = undefined;
    } catch (error) {
      if (error instanceof MediaValidationError && error.code === "invalid_signature") {
        await quarantineMediaObject({ agencyId: input.agencyId, objectId: object.id });
        status = "failed";
        failureCode = error.code;
      }
    }
  }

  if (dimensions) {
    try {
      await db
        .update(storageObjects)
        .set({ width: dimensions.width, height: dimensions.height, updatedAt: new Date() })
        .where(eq(storageObjects.id, object.id));
    } catch {
      // Dimensions are optional metadata; a temporary update failure must not
      // turn an otherwise verified asset into a failed upload.
    }
  }

  try {
    const [asset] = await db
      .insert(mediaAssets)
      .values({
        agencyId: input.agencyId,
        ownerWorkspaceId: input.workspaceId,
        storageObjectId: input.storageObjectId,
        title: sanitizeAssetTitle(input.title),
        visibility: input.visibility ?? "workspace",
        status,
        ...(failureCode ? { failureCode } : {}),
        sourceType,
        ...(input.sourceProvider ? { sourceProvider: input.sourceProvider } : {}),
        ...(input.sourceReference ? { sourceReference: input.sourceReference } : {}),
        ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
        ...(input.sourceModifiedAt ? { sourceModifiedAt: input.sourceModifiedAt } : {}),
        createdBy: input.actor.id,
        updatedBy: input.actor.id,
      })
      .onConflictDoNothing({ target: mediaAssets.storageObjectId })
      .returning();
    if (asset) return asset;

    // A concurrent request may have won the unique storage-object race.
    const [alreadyRegistered] = await db
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(eq(mediaAssets.storageObjectId, input.storageObjectId))
      .limit(1);
    if (alreadyRegistered) return alreadyRegistered;
    throw new Error("Media asset could not be registered");
  } catch (error) {
    // Never leave a completed storage object active when catalog registration
    // fails. If another request registered it concurrently, preserve that
    // winner and avoid quarantining its live object.
    const [alreadyRegistered] = await db
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(eq(mediaAssets.storageObjectId, input.storageObjectId))
      .limit(1);
    if (alreadyRegistered) return alreadyRegistered;
    await quarantineMediaObject({ agencyId: input.agencyId, objectId: input.storageObjectId });
    throw error;
  }
}

/** Cron-safe promotion for objects whose provider was temporarily unavailable. */
export async function processPendingMediaAssets(limit = 50) {
  const rows = await db
    .select({
      assetId: mediaAssets.id,
      agencyId: mediaAssets.agencyId,
      workspaceId: mediaAssets.ownerWorkspaceId,
      objectId: storageObjects.id,
      contentType: storageObjects.mimeType,
    })
    .from(mediaAssets)
    .innerJoin(storageObjects, eq(storageObjects.id, mediaAssets.storageObjectId))
    .where(eq(mediaAssets.status, "processing"))
    .orderBy(asc(mediaAssets.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
  let ready = 0;
  let failed = 0;
  let pending = 0;
  for (const row of rows) {
    try {
      const dimensions = await validateStoredMediaObject(row);
      if (dimensions) {
        try {
          await db
            .update(storageObjects)
            .set({ width: dimensions.width, height: dimensions.height, updatedAt: new Date() })
            .where(eq(storageObjects.id, row.objectId));
        } catch {
          // Optional metadata must not keep a verified upload pending.
        }
      }
      await db
        .update(mediaAssets)
        .set({ status: "ready", failureCode: null, updatedAt: new Date() })
        .where(and(eq(mediaAssets.id, row.assetId), eq(mediaAssets.status, "processing")));
      ready += 1;
    } catch (error) {
      if (error instanceof MediaValidationError && error.code === "invalid_signature") {
        await quarantineMediaObject({ agencyId: row.agencyId, objectId: row.objectId });
        await db
          .update(mediaAssets)
          .set({ status: "failed", failureCode: error.code, updatedAt: new Date() })
          .where(and(eq(mediaAssets.id, row.assetId), eq(mediaAssets.status, "processing")));
        failed += 1;
      } else {
        pending += 1;
      }
    }
  }
  return { checked: rows.length, ready, failed, pending } as const;
}

export async function renameMediaAsset(actor: Actor, assetId: string, title: string) {
  const [row] = await db
    .select({ id: mediaAssets.id, workspaceId: mediaAssets.ownerWorkspaceId })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, assetId))
    .limit(1);
  if (!row || !(await hasWorkspaceRole(actor, row.workspaceId, ["workspace_manager"]))) {
    throw new MediaPermissionError();
  }
  const [updated] = await db
    .update(mediaAssets)
    .set({ title: sanitizeAssetTitle(title), updatedBy: actor.id, updatedAt: new Date() })
    .where(eq(mediaAssets.id, assetId))
    .returning();
  return updated ?? null;
}

export async function setMediaAssetVisibility(
  actor: Actor,
  assetId: string,
  visibility: "workspace" | "agency",
) {
  const [row] = await db
    .select({ id: mediaAssets.id, workspaceId: mediaAssets.ownerWorkspaceId })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, assetId))
    .limit(1);
  if (!row || !(await hasWorkspaceRole(actor, row.workspaceId, ["workspace_manager"]))) {
    throw new MediaPermissionError();
  }
  const [updated] = await db
    .update(mediaAssets)
    .set({ visibility, updatedBy: actor.id, updatedAt: new Date() })
    .where(eq(mediaAssets.id, assetId))
    .returning();
  return updated ?? null;
}

export async function trashMediaAsset(actor: Actor, assetId: string) {
  const [row] = await db
    .select({ id: mediaAssets.id, workspaceId: mediaAssets.ownerWorkspaceId })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, assetId))
    .limit(1);
  if (!row || !(await hasWorkspaceRole(actor, row.workspaceId, ["workspace_manager"]))) {
    throw new MediaPermissionError();
  }
  const now = new Date();
  const [updated] = await db
    .update(mediaAssets)
    .set({
      status: "trashed",
      trashedAt: now,
      deleteAfter: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      updatedBy: actor.id,
      updatedAt: now,
    })
    .where(eq(mediaAssets.id, assetId))
    .returning();
  return updated ?? null;
}

export async function restoreMediaAsset(actor: Actor, assetId: string) {
  const [row] = await db
    .select({ id: mediaAssets.id, workspaceId: mediaAssets.ownerWorkspaceId })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, assetId))
    .limit(1);
  if (!row || !(await hasWorkspaceRole(actor, row.workspaceId, ["workspace_manager"]))) {
    throw new MediaPermissionError();
  }
  const [updated] = await db
    .update(mediaAssets)
    .set({
      status: "ready",
      trashedAt: null,
      deleteAfter: null,
      updatedBy: actor.id,
      updatedAt: new Date(),
    })
    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.status, "trashed")))
    .returning();
  return updated ?? null;
}

export async function mediaAssetForActor(actor: Actor, assetId: string) {
  const [row] = await db
    .select({ asset: mediaAssets, object: storageObjects })
    .from(mediaAssets)
    .innerJoin(storageObjects, eq(storageObjects.id, mediaAssets.storageObjectId))
    .where(eq(mediaAssets.id, assetId))
    .limit(1);
  if (!row) return null;
  const ownerAccess = await hasWorkspaceRole(actor, row.asset.ownerWorkspaceId, [
    "workspace_manager",
    "content_planner",
    "designer",
    "internal_reviewer",
    "publisher",
  ]);
  if (ownerAccess) return row;
  if (row.asset.visibility === "agency" && (await isAgencyMember(actor, row.asset.agencyId))) {
    const [internal] = await db
      .select({ role: workspaceMembershipRoles.role })
      .from(workspaceMembershipRoles)
      .innerJoin(
        workspaceMemberships,
        eq(workspaceMemberships.id, workspaceMembershipRoles.workspaceMembershipId),
      )
      .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
      .where(
        and(
          eq(workspaceMemberships.userId, actor.id),
          eq(workspaceMemberships.status, "active"),
          eq(workspaces.agencyId, row.asset.agencyId),
          inArray(workspaceMembershipRoles.role, [...MEDIA_READ_ROLES]),
        ),
      )
      .limit(1);
    if (internal?.role) return row;
  }
  return null;
}

export async function importPublicMediaAsset(input: {
  actor: Actor;
  agencyId: string;
  workspaceId: string;
  url: string;
  title?: string;
  visibility?: "workspace" | "agency";
}) {
  if (!(await canWriteToWorkspace(input.actor, input.workspaceId))) {
    throw new MediaPermissionError("Read-only users cannot import media.");
  }
  const source = await fetchPublicMedia({ url: input.url });
  let sourceName = "";
  try {
    const pathname = new URL(source.finalUrl).pathname;
    const lastSegment = pathname.split("/").filter(Boolean).pop() ?? "";
    sourceName = decodeURIComponent(lastSegment);
  } catch {
    // The source fetch already validated the URL; an unusable path is simply
    // treated as an unnamed import rather than becoming a title with query
    // credentials or encoded path syntax.
  }
  const safeSourceUrl = redactMediaSourceUrl(source.finalUrl);
  const lastModifiedHeader = source.response.headers.get("last-modified");
  const sourceModifiedAt = lastModifiedHeader ? new Date(lastModifiedHeader) : null;
  const signed = await createStorageUploadIntent({
    agencyId: input.agencyId,
    workspaceId: input.workspaceId,
    userId: input.actor.id,
    kind: source.kind,
    extension: source.extension,
    contentType: source.contentType,
    expectedByteSize: source.byteSize,
    ...(sourceName ? { originalName: sourceName } : {}),
  });
  try {
    const response = await fetch(signed.uploadUrl, {
      method: "PUT",
      body: source.response.body,
      headers: {
        ...(signed.requiredHeaders ?? {}),
        "Content-Length": String(source.byteSize),
      },
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    if (!response.ok) throw new MediaSourceError("fetch_failed", "The file could not be stored.");
    const completed = await completeStorageUpload({
      agencyId: input.agencyId,
      workspaceId: input.workspaceId,
      intentId: signed.uploadIntentId,
    });
    return registerUploadedMediaAsset({
      actor: input.actor,
      agencyId: input.agencyId,
      workspaceId: input.workspaceId,
      storageObjectId: completed.objectId,
      title: input.title ?? (sourceName ? titleFromFilename(sourceName) : "Imported media"),
      ...(input.visibility ? { visibility: input.visibility } : {}),
      sourceType:
        source.provider === "google_drive"
          ? "google_drive"
          : source.provider === "onedrive"
            ? "onedrive"
            : "external_url",
      sourceProvider: source.provider,
      ...(safeSourceUrl ? { sourceReference: safeSourceUrl, sourceUrl: safeSourceUrl } : {}),
      ...(sourceModifiedAt && Number.isFinite(sourceModifiedAt.getTime())
        ? { sourceModifiedAt }
        : {}),
    });
  } catch (error) {
    await abortStorageUpload({
      agencyId: input.agencyId,
      workspaceId: input.workspaceId,
      intentId: signed.uploadIntentId,
    });
    throw error;
  }
}
