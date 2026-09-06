import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { and, eq, sql, sum } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencyUsageCounters, storageObjects, workspaces } from "@/lib/db/schema";
import { createAgencyObjectKey } from "@/lib/storage/object-key";
import { getAgencyStorageContext } from "@/lib/storage/config";

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
};

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function checksum(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("base64");
}

function extension(fileName: string): string {
  const ext = path.extname(fileName).replace(/^\./, "").toLowerCase();
  return ext || "bin";
}

async function migrateFile(
  workspaceId: string,
  fileName: string,
  dryRun: boolean,
  deleteLocal: boolean,
) {
  const [workspace] = await db
    .select({ agencyId: workspaces.agencyId, createdBy: workspaces.createdBy })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) return { skipped: true, reason: "workspace_not_found" };

  const ext = extension(fileName);
  const fileId = path.basename(fileName, path.extname(fileName));
  const objectKey = createAgencyObjectKey({
    agencyId: workspace.agencyId,
    workspaceId,
    assetId: fileId,
    extension: ext,
  });
  const existing = await db
    .select({ id: storageObjects.id })
    .from(storageObjects)
    .where(
      and(eq(storageObjects.agencyId, workspace.agencyId), eq(storageObjects.objectKey, objectKey)),
    )
    .limit(1);
  if (existing[0]) return { skipped: true, reason: "already_migrated" };

  const localPath = path.join(ROOT, workspaceId, fileName);
  const buffer = await readFile(localPath);
  const digest = checksum(buffer);
  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
  if (dryRun) return { skipped: false, bytes: buffer.byteLength, checksum: digest };

  const context = await getAgencyStorageContext(workspace.agencyId);
  const signed = await context.adapter.createUploadIntent({
    objectKey,
    contentType,
    contentLength: buffer.byteLength,
    checksumSha256: digest,
  });
  const put = await fetch(signed.uploadUrl, {
    method: "PUT",
    body: buffer,
    ...(signed.requiredHeaders ? { headers: signed.requiredHeaders } : {}),
  });
  if (!put.ok) throw new Error(`R2 upload failed for ${workspaceId}/${fileName}: ${put.status}`);
  const metadata = await context.adapter.completeUpload({ objectKey });
  if (metadata.contentLength !== buffer.byteLength || metadata.checksumSha256 !== digest) {
    await context.adapter.abortUpload({ objectKey });
    throw new Error(`Checksum/size verification failed for ${workspaceId}/${fileName}`);
  }
  await db.insert(storageObjects).values({
    agencyId: workspace.agencyId,
    workspaceId,
    bucket: context.bucket,
    objectKey,
    status: "active",
    kind: "other",
    originalName: fileName,
    mimeType: contentType,
    byteSize: buffer.byteLength,
    checksumSha256: digest,
    createdBy: workspace.createdBy,
  });
  if (deleteLocal) {
    // Deletion is intentionally not automated in the normal migration pass.
    // The operator can remove the legacy file after restore verification.
    const fileStat = await stat(localPath);
    if (fileStat.isFile()) {
      const { unlink } = await import("node:fs/promises");
      await unlink(localPath);
    }
  }
  return { skipped: false, bytes: buffer.byteLength, checksum: digest };
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  const deleteLocal = hasFlag("--delete-local");
  if (!dryRun && process.env.BACKUP_CONFIRMED !== "yes") {
    throw new Error(
      "Refusing migration until BACKUP_CONFIRMED=yes is set after database and volume backups",
    );
  }
  const workspaceEntries = await readdir(ROOT, { withFileTypes: true });
  let migrated = 0;
  let skipped = 0;
  let bytes = 0;
  for (const workspaceEntry of workspaceEntries) {
    if (!workspaceEntry.isDirectory()) continue;
    const files = await readdir(path.join(ROOT, workspaceEntry.name), { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile()) continue;
      const result = await migrateFile(workspaceEntry.name, file.name, dryRun, deleteLocal);
      if (result.skipped) skipped += 1;
      else {
        migrated += 1;
        bytes += result.bytes ?? 0;
      }
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
  console.log(JSON.stringify({ ok: true, dryRun, deleteLocal, migrated, skipped, bytes }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "storage migration failed");
  process.exitCode = 1;
});
