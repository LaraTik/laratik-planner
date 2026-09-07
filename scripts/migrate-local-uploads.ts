import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import type { Dirent } from "node:fs";
import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, isNull, sql, sum } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agencyUsageCounters,
  attachments,
  brandAssets,
  mediaAssetLinks,
  mediaAssets,
  storageObjects,
  workspaces,
} from "@/lib/db/schema";
import { createAgencyObjectKey } from "@/lib/storage/object-key";
import { getAgencyStorageContext } from "@/lib/storage/config";
import {
  extensionForContentType,
  sanitizeOriginalFilename,
  titleFromFilename,
  validateMediaSignature,
  validateMediaUpload,
} from "@/lib/media/contract";

/**
 * Migrate the legacy `/data/uploads/{workspaceId}/{file}` layout to the
 * database-configured R2 provider. The script is intentionally one-file-at-a
 * time, resumable, and never deletes local data unless `--delete-local` is
 * explicitly supplied after the operator has accepted the restore evidence.
 *
 * Required production procedure:
 *   1. database dump + app-uploads volume backup
 *   2. BACKUP_CONFIRMED=yes pnpm tsx scripts/migrate-local-uploads.ts
 *   3. verify object counts, checksums, previews, and restore evidence
 *   4. BACKUP_CONFIRMED=yes pnpm tsx scripts/migrate-local-uploads.ts --delete-local
 */

const ROOT = process.env.UPLOADS_DIR || "/data/uploads";
const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  mp4: "video/mp4",
  mov: "video/quicktime",
  txt: "text/plain",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function extension(fileName: string): string {
  const ext = path.extname(fileName).replace(/^\./, "").toLowerCase();
  return ext || "bin";
}

function mediaKind(ext: string): "image" | "video" | "document" | "other" {
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "image";
  if (["mp4", "mov"].includes(ext)) return "video";
  if (["pdf", "txt", "docx"].includes(ext)) return "document";
  return "other";
}

type MigratedMediaKind = "image" | "video" | "document";
type LegacyReferenceType = "brand_asset" | "attachment";
type MigrationFileResult = {
  skipped: boolean;
  reason?: string;
  bytes?: number;
  checksum?: string;
  kind?: MigratedMediaKind;
  localCleanup?: "deleted" | "skipped_changed" | "missing";
  linkedReferences?: number;
  linkedByType?: Partial<Record<LegacyReferenceType, number>>;
  referenceConflicts?: number;
};

export type MigrationReportInput = {
  dryRun: boolean;
  deleteLocal: boolean;
  sourcePresent: boolean;
  migrated: number;
  skipped: number;
  bytes: number;
  localCleanupSkipped: number;
  migratedByKind: Partial<Record<MigratedMediaKind, number>>;
  skippedByReason: Record<string, number>;
  linkedReferences: number;
  linkedByType: Partial<Record<LegacyReferenceType, number>>;
  referenceConflicts: number;
  reason?: string;
};

/**
 * Build the versioned reconciliation report emitted by the migration CLI.
 * Keeping this pure makes the compatibility contract executable in unit tests
 * even when a deployment has no legacy volume mounted yet. Report version 2
 * adds the reference-linkage counters needed to prove that old Brand Kit and
 * discussion rows no longer depend on a local path after migration.
 */
export function buildMigrationReport(input: MigrationReportInput) {
  return {
    ok: true as const,
    reportVersion: 2 as const,
    dryRun: input.dryRun,
    deleteLocal: input.deleteLocal,
    sourcePresent: input.sourcePresent,
    migrated: input.migrated,
    skipped: input.skipped,
    bytes: input.bytes,
    localCleanupSkipped: input.localCleanupSkipped,
    migratedByKind: input.migratedByKind,
    skippedByReason: input.skippedByReason,
    linkedReferences: input.linkedReferences,
    linkedByType: input.linkedByType,
    referenceConflicts: input.referenceConflicts,
    ...(input.reason ? { reason: input.reason } : {}),
  };
}

export function buildEmptyMigrationReport(input: { dryRun: boolean; deleteLocal: boolean }) {
  return buildMigrationReport({
    ...input,
    sourcePresent: false,
    migrated: 0,
    skipped: 0,
    bytes: 0,
    localCleanupSkipped: 0,
    migratedByKind: {},
    skippedByReason: {},
    linkedReferences: 0,
    linkedByType: {},
    referenceConflicts: 0,
    reason: "legacy_root_missing",
  });
}

function stableMigrationAssetId(workspaceId: string, fileName: string): string {
  return createHash("sha256").update(`${workspaceId}:${fileName}`).digest("hex").slice(0, 32);
}

function legacyFilenameAssetId(fileName: string): string | null {
  const candidate = path.basename(fileName, path.extname(fileName));
  return /^[a-zA-Z0-9_-]+$/.test(candidate) ? candidate : null;
}

async function inspectFile(filePath: string): Promise<{
  byteSize: number;
  checksumSha256: string;
  prefix: Buffer;
}> {
  const hash = createHash("sha256");
  const prefixParts: Buffer[] = [];
  let byteSize = 0;
  for await (const chunk of createReadStream(filePath)) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (byteSize < 512) prefixParts.push(bytes.subarray(0, 512 - byteSize));
    hash.update(bytes);
    byteSize += bytes.byteLength;
  }
  return {
    byteSize,
    checksumSha256: hash.digest("base64"),
    prefix: Buffer.concat(prefixParts).subarray(0, 512),
  };
}

async function deleteLegacyFileIfUnchanged(
  filePath: string,
  expected: { byteSize: number; checksumSha256: string },
): Promise<"deleted" | "skipped_changed" | "missing"> {
  try {
    const current = await inspectFile(filePath);
    if (
      current.byteSize !== expected.byteSize ||
      current.checksumSha256 !== expected.checksumSha256
    ) {
      return "skipped_changed";
    }
    await unlink(filePath);
    return "deleted";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    throw error;
  }
}

async function ensureLegacyMediaAsset(input: {
  agencyId: string;
  workspaceId: string;
  storageObjectId: string;
  fileName: string;
  createdBy: string;
  sourceModifiedAt?: Date;
}): Promise<string> {
  const [existing] = await db
    .select({ id: mediaAssets.id, sourceModifiedAt: mediaAssets.sourceModifiedAt })
    .from(mediaAssets)
    .where(eq(mediaAssets.storageObjectId, input.storageObjectId))
    .limit(1);
  if (existing) {
    if (!existing.sourceModifiedAt && input.sourceModifiedAt) {
      await db
        .update(mediaAssets)
        .set({ sourceModifiedAt: input.sourceModifiedAt, updatedAt: new Date() })
        .where(eq(mediaAssets.id, existing.id));
    }
    return existing.id;
  }
  const [inserted] = await db
    .insert(mediaAssets)
    .values({
      agencyId: input.agencyId,
      ownerWorkspaceId: input.workspaceId,
      storageObjectId: input.storageObjectId,
      title: titleFromFilename(input.fileName),
      visibility: "workspace",
      status: "ready",
      sourceType: "legacy",
      sourceProvider: "local_volume",
      sourceReference: `${input.workspaceId}/${input.fileName}`,
      ...(input.sourceModifiedAt ? { sourceModifiedAt: input.sourceModifiedAt } : {}),
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    })
    .onConflictDoNothing({ target: mediaAssets.storageObjectId })
    .returning({ id: mediaAssets.id });
  if (inserted) return inserted.id;

  // Another migration worker may have won the race after the first SELECT.
  const [raced] = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(eq(mediaAssets.storageObjectId, input.storageObjectId))
    .limit(1);
  if (!raced) throw new Error(`Media catalog row was not created for ${input.fileName}`);
  return raced.id;
}

type LegacyReferenceLinkResult = {
  linked: number;
  linkedByType: Partial<Record<LegacyReferenceType, number>>;
  conflicts: number;
};

/**
 * Reconnect rows that still point at the old local-volume path. The old path
 * is deliberately retained for rollback and audit, while storage_object_id
 * becomes the preferred read path. A conflicting existing object reference is
 * never overwritten; it is reported for operator review instead.
 */
async function linkLegacyReferences(input: {
  agencyId: string;
  workspaceId: string;
  fileName: string;
  storageObjectId: string;
  mediaAssetId: string;
}): Promise<LegacyReferenceLinkResult> {
  const legacyPath = `${input.workspaceId}/${input.fileName}`;
  const result: LegacyReferenceLinkResult = { linked: 0, linkedByType: {}, conflicts: 0 };

  const brandRows = await db
    .select({
      id: brandAssets.id,
      createdBy: brandAssets.createdBy,
      storageObjectId: brandAssets.storageObjectId,
    })
    .from(brandAssets)
    .where(
      and(eq(brandAssets.workspaceId, input.workspaceId), eq(brandAssets.storagePath, legacyPath)),
    );
  for (const row of brandRows) {
    if (row.storageObjectId && row.storageObjectId !== input.storageObjectId) {
      result.conflicts += 1;
      continue;
    }
    let updated = false;
    if (!row.storageObjectId) {
      const [updatedRow] = await db
        .update(brandAssets)
        .set({ storageObjectId: input.storageObjectId, updatedAt: new Date() })
        .where(and(eq(brandAssets.id, row.id), isNull(brandAssets.storageObjectId)))
        .returning({ id: brandAssets.id });
      updated = Boolean(updatedRow);
    }
    const [link] = await db
      .insert(mediaAssetLinks)
      .values({
        agencyId: input.agencyId,
        workspaceId: input.workspaceId,
        mediaAssetId: input.mediaAssetId,
        targetType: "brand_asset",
        targetId: row.id,
        createdBy: row.createdBy,
      })
      .onConflictDoNothing()
      .returning({ id: mediaAssetLinks.id });
    if (updated || link) {
      result.linked += 1;
      result.linkedByType.brand_asset = (result.linkedByType.brand_asset ?? 0) + 1;
    }
  }

  const attachmentRows = await db
    .select({
      id: attachments.id,
      uploadedBy: attachments.uploadedBy,
      storageObjectId: attachments.storageObjectId,
      contentItemId: attachments.contentItemId,
      commentId: attachments.commentId,
      deliveryVersionId: attachments.deliveryVersionId,
    })
    .from(attachments)
    .where(
      and(eq(attachments.workspaceId, input.workspaceId), eq(attachments.storagePath, legacyPath)),
    );
  for (const row of attachmentRows) {
    if (row.storageObjectId && row.storageObjectId !== input.storageObjectId) {
      result.conflicts += 1;
      continue;
    }
    let updated = false;
    if (!row.storageObjectId) {
      const [updatedRow] = await db
        .update(attachments)
        .set({ storageObjectId: input.storageObjectId })
        .where(and(eq(attachments.id, row.id), isNull(attachments.storageObjectId)))
        .returning({ id: attachments.id });
      updated = Boolean(updatedRow);
    }
    let linkCreated = false;
    const targets = [
      { targetType: "content_item", targetId: row.contentItemId },
      { targetType: "comment", targetId: row.commentId },
      { targetType: "delivery", targetId: row.deliveryVersionId },
    ] as const;
    for (const target of targets) {
      if (!target.targetId) continue;
      const [link] = await db
        .insert(mediaAssetLinks)
        .values({
          agencyId: input.agencyId,
          workspaceId: input.workspaceId,
          mediaAssetId: input.mediaAssetId,
          targetType: target.targetType,
          targetId: target.targetId,
          createdBy: row.uploadedBy,
        })
        .onConflictDoNothing()
        .returning({ id: mediaAssetLinks.id });
      linkCreated ||= !!link;
    }
    if (updated || linkCreated) {
      result.linked += 1;
      result.linkedByType.attachment = (result.linkedByType.attachment ?? 0) + 1;
    }
  }

  return result;
}

async function migrateFile(
  workspaceId: string,
  fileName: string,
  dryRun: boolean,
  deleteLocal: boolean,
): Promise<MigrationFileResult> {
  const [workspace] = await db
    .select({ agencyId: workspaces.agencyId, createdBy: workspaces.createdBy })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) return { skipped: true, reason: "workspace_not_found" };

  const localPath = path.join(ROOT, workspaceId, fileName);
  const ext = extension(fileName);
  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
  const kind = mediaKind(ext);
  const canonicalExtension = extensionForContentType(contentType);
  const fileId = stableMigrationAssetId(workspaceId, fileName);
  const objectKey = createAgencyObjectKey({
    agencyId: workspace.agencyId,
    workspaceId,
    assetId: fileId,
    extension: canonicalExtension,
  });
  let existing = await db
    .select({ id: storageObjects.id })
    .from(storageObjects)
    .where(
      and(
        eq(storageObjects.agencyId, workspace.agencyId),
        eq(storageObjects.objectKey, objectKey),
        eq(storageObjects.status, "active"),
      ),
    )
    .limit(1);
  if (!existing[0] && ext !== canonicalExtension) {
    const previousObjectKey = createAgencyObjectKey({
      agencyId: workspace.agencyId,
      workspaceId,
      assetId: fileId,
      extension: ext,
    });
    existing = await db
      .select({ id: storageObjects.id })
      .from(storageObjects)
      .where(
        and(
          eq(storageObjects.agencyId, workspace.agencyId),
          eq(storageObjects.objectKey, previousObjectKey),
          eq(storageObjects.status, "active"),
        ),
      )
      .limit(1);
  }
  if (!existing[0]) {
    const oldAssetId = legacyFilenameAssetId(fileName);
    if (oldAssetId) {
      const oldObjectKey = createAgencyObjectKey({
        agencyId: workspace.agencyId,
        workspaceId,
        assetId: oldAssetId,
        extension: ext,
      });
      existing = await db
        .select({ id: storageObjects.id })
        .from(storageObjects)
        .where(
          and(
            eq(storageObjects.agencyId, workspace.agencyId),
            eq(storageObjects.objectKey, oldObjectKey),
            eq(storageObjects.status, "active"),
          ),
        )
        .limit(1);
    }
  }
  if (existing[0]) {
    let sourceModifiedAt: Date | undefined;
    try {
      sourceModifiedAt = (await stat(localPath)).mtime;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const mediaAssetId = await ensureLegacyMediaAsset({
      agencyId: workspace.agencyId,
      workspaceId,
      storageObjectId: existing[0].id,
      fileName,
      createdBy: workspace.createdBy,
      ...(sourceModifiedAt ? { sourceModifiedAt } : {}),
    });
    const references = await linkLegacyReferences({
      agencyId: workspace.agencyId,
      workspaceId,
      fileName,
      storageObjectId: existing[0].id,
      mediaAssetId,
    });
    return {
      skipped: true,
      reason: "already_migrated",
      linkedReferences: references.linked,
      linkedByType: references.linkedByType,
      referenceConflicts: references.conflicts,
    };
  }
  if (kind === "other") return { skipped: true, reason: "unsupported_type" };

  const fileStat = await stat(localPath);
  const sizeValidation = validateMediaUpload({
    kind,
    contentType,
    byteSize: fileStat.size,
  });
  if (!sizeValidation.ok) return { skipped: true, reason: sizeValidation.code };

  const inspected = await inspectFile(localPath);
  if (inspected.byteSize !== fileStat.size) {
    return { skipped: true, reason: "source_changed" };
  }
  if (!validateMediaSignature(contentType, inspected.prefix).ok) {
    return { skipped: true, reason: "invalid_signature" };
  }
  if (dryRun) {
    return {
      skipped: false,
      bytes: inspected.byteSize,
      checksum: inspected.checksumSha256,
      kind,
    };
  }

  const context = await getAgencyStorageContext(workspace.agencyId);
  const signed = await context.adapter.createUploadIntent({
    objectKey,
    contentType,
    contentLength: inspected.byteSize,
    checksumSha256: inspected.checksumSha256,
  });
  let references: LegacyReferenceLinkResult = { linked: 0, linkedByType: {}, conflicts: 0 };
  let mediaAssetId: string | undefined;
  try {
    const put = await fetch(signed.uploadUrl, {
      method: "PUT",
      body: createReadStream(localPath) as unknown as BodyInit,
      headers: {
        ...(signed.requiredHeaders ?? {}),
        "Content-Length": String(inspected.byteSize),
      },
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    if (!put.ok) throw new Error(`R2 upload failed for ${workspaceId}/${fileName}: ${put.status}`);
    const metadata = await context.adapter.completeUpload({ objectKey });
    if (
      metadata.contentLength !== inspected.byteSize ||
      metadata.checksumSha256 !== inspected.checksumSha256
    ) {
      throw new Error(`Checksum/size verification failed for ${workspaceId}/${fileName}`);
    }
    const [storageObject] = await db
      .insert(storageObjects)
      .values({
        agencyId: workspace.agencyId,
        workspaceId,
        bucket: context.bucket,
        objectKey,
        status: "active",
        kind,
        originalName: sanitizeOriginalFilename(fileName),
        mimeType: contentType,
        byteSize: inspected.byteSize,
        checksumSha256: inspected.checksumSha256,
        createdBy: workspace.createdBy,
      })
      .returning({ id: storageObjects.id });
    if (!storageObject)
      throw new Error(`Storage object row was not created for ${workspaceId}/${fileName}`);
    mediaAssetId = await ensureLegacyMediaAsset({
      agencyId: workspace.agencyId,
      workspaceId,
      storageObjectId: storageObject.id,
      fileName,
      createdBy: workspace.createdBy,
      sourceModifiedAt: fileStat.mtime,
    });
    references = await linkLegacyReferences({
      agencyId: workspace.agencyId,
      workspaceId,
      fileName,
      storageObjectId: storageObject.id,
      mediaAssetId,
    });
  } catch (error) {
    try {
      await context.adapter.abortUpload({ objectKey });
    } catch {
      // Preserve the original migration error; orphan reconciliation retries cleanup.
    }
    if (mediaAssetId) {
      await db.delete(mediaAssetLinks).where(eq(mediaAssetLinks.mediaAssetId, mediaAssetId));
      await db.delete(mediaAssets).where(eq(mediaAssets.id, mediaAssetId));
    }
    await db
      .update(storageObjects)
      .set({ status: "deleted", deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(storageObjects.agencyId, workspace.agencyId),
          eq(storageObjects.objectKey, objectKey),
          eq(storageObjects.status, "active"),
        ),
      );
    throw error;
  }
  if (deleteLocal) {
    // Re-hash before deletion so a concurrent edit cannot be lost after the
    // earlier snapshot was copied to the provider.
    const cleanup = await deleteLegacyFileIfUnchanged(localPath, {
      byteSize: inspected.byteSize,
      checksumSha256: inspected.checksumSha256,
    });
    if (cleanup === "skipped_changed") {
      console.warn(`Keeping changed legacy file: ${workspaceId}/${fileName}`);
    }
    return {
      skipped: false,
      bytes: inspected.byteSize,
      checksum: inspected.checksumSha256,
      kind,
      localCleanup: cleanup,
      linkedReferences: references.linked,
      linkedByType: references.linkedByType,
      referenceConflicts: references.conflicts,
    };
  }
  return {
    skipped: false,
    bytes: inspected.byteSize,
    checksum: inspected.checksumSha256,
    kind,
    linkedReferences: references.linked,
    linkedByType: references.linkedByType,
    referenceConflicts: references.conflicts,
  };
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  const deleteLocal = hasFlag("--delete-local");
  if (!dryRun && process.env.BACKUP_CONFIRMED !== "yes") {
    throw new Error(
      "Refusing migration until BACKUP_CONFIRMED=yes is set after database and volume backups",
    );
  }
  let workspaceEntries: Dirent[];
  try {
    workspaceEntries = await readdir(ROOT, { withFileTypes: true });
  } catch (error) {
    // A fresh installation has no legacy volume. Treat that as an explicit,
    // successful empty inventory so operators can run the compatibility check
    // before any legacy data exists.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.log(JSON.stringify(buildEmptyMigrationReport({ dryRun, deleteLocal })));
      return;
    }
    throw error;
  }
  let migrated = 0;
  let skipped = 0;
  let bytes = 0;
  let localCleanupSkipped = 0;
  let linkedReferences = 0;
  let referenceConflicts = 0;
  const linkedByType: Record<LegacyReferenceType, number> = {
    brand_asset: 0,
    attachment: 0,
  };
  const migratedByKind: Record<MigratedMediaKind, number> = {
    image: 0,
    video: 0,
    document: 0,
  };
  const skippedByReason: Record<string, number> = {};
  for (const workspaceEntry of workspaceEntries) {
    if (!workspaceEntry.isDirectory()) continue;
    const files = await readdir(path.join(ROOT, workspaceEntry.name), { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile()) continue;
      const result = await migrateFile(workspaceEntry.name, file.name, dryRun, deleteLocal);
      if (result.skipped) {
        skipped += 1;
        const reason = result.reason ?? "unknown";
        skippedByReason[reason] = (skippedByReason[reason] ?? 0) + 1;
      } else {
        migrated += 1;
        bytes += result.bytes ?? 0;
        if (result.kind) migratedByKind[result.kind] += 1;
        if ("localCleanup" in result && result.localCleanup === "skipped_changed") {
          localCleanupSkipped += 1;
        }
      }
      linkedReferences += result.linkedReferences ?? 0;
      for (const [type, count] of Object.entries(result.linkedByType ?? {})) {
        if (type === "brand_asset" || type === "attachment") {
          linkedByType[type] += count ?? 0;
        }
      }
      referenceConflicts += result.referenceConflicts ?? 0;
    }
  }
  if (!dryRun) {
    const totals = await db
      .select({ agencyId: storageObjects.agencyId, bytes: sum(storageObjects.byteSize) })
      .from(storageObjects)
      .where(eq(storageObjects.status, "active"))
      .groupBy(storageObjects.agencyId);
    for (const total of totals) {
      await db
        .insert(agencyUsageCounters)
        .values({
          agencyId: total.agencyId,
          resourceKey: "storage_bytes",
          currentValue: Number(total.bytes ?? 0),
          lastRecordedAt: new Date(),
          lastUpdatedAt: new Date(),
          version: 1,
        })
        .onConflictDoUpdate({
          target: [agencyUsageCounters.agencyId, agencyUsageCounters.resourceKey],
          set: {
            currentValue: Number(total.bytes ?? 0),
            lastRecordedAt: new Date(),
            lastUpdatedAt: new Date(),
            version: sql`${agencyUsageCounters.version} + 1`,
          },
        });
    }
  }
  console.log(
    JSON.stringify(
      buildMigrationReport({
        dryRun,
        deleteLocal,
        sourcePresent: true,
        migrated,
        skipped,
        bytes,
        localCleanupSkipped,
        migratedByKind,
        skippedByReason,
        linkedReferences,
        linkedByType,
        referenceConflicts,
      }),
    ),
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "storage migration failed");
    process.exitCode = 1;
  });
}
