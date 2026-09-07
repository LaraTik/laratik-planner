import "server-only";
import { and, eq, inArray, lt, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { storageObjects, storageUploadIntents, workspaces } from "@/lib/db/schema";
import { releaseCapacityAmount, reserveCapacity } from "@/lib/entitlements";
import { getAgencyStorageContext } from "./config";
import { createAgencyObjectKey, isObjectKeyInAgencyPrefix } from "./object-key";
import { UPLOAD_SIZE_LIMITS, type UploadKind } from "./index";
import { extensionForContentType, sanitizeOriginalFilename } from "@/lib/media/contract";

export class StorageIntentError extends Error {
  constructor(
    public readonly code:
      | "storage.workspace_not_found"
      | "storage.quota_exceeded"
      | "storage.intent_not_found"
      | "storage.intent_expired"
      | "storage.object_verification_failed"
      | "storage.intent_already_final",
    message: string,
  ) {
    super(message);
    this.name = "StorageIntentError";
  }
}

const CONTENT_TYPE_BY_KIND: Record<UploadKind, readonly string[]> = {
  logo: ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"],
  color: ["image/png", "image/jpeg", "image/webp"],
  font: [
    "font/woff",
    "font/woff2",
    "font/ttf",
    "application/font-woff",
    "application/octet-stream",
  ],
  image: ["image/png", "image/jpeg", "image/gif", "image/webp"],
  video: ["video/mp4", "video/quicktime", "video/webm"],
  document: [
    "application/pdf",
    "text/plain",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  other: ["application/octet-stream"],
};

function assertUploadInput(input: {
  kind: UploadKind;
  expectedByteSize: number;
  contentType: string;
}): void {
  const limit = UPLOAD_SIZE_LIMITS[input.kind];
  if (!Number.isSafeInteger(input.expectedByteSize) || input.expectedByteSize < 1) {
    throw new StorageIntentError(
      "storage.object_verification_failed",
      "The upload size is invalid",
    );
  }
  if (input.expectedByteSize > limit) {
    throw new StorageIntentError(
      "storage.object_verification_failed",
      "The file exceeds its type limit",
    );
  }
  if (!CONTENT_TYPE_BY_KIND[input.kind].includes(input.contentType)) {
    throw new StorageIntentError(
      "storage.object_verification_failed",
      "The file type is not allowed",
    );
  }
}

async function assertWorkspaceBelongsToAgency(
  workspaceId: string,
  agencyId: string,
): Promise<void> {
  const [workspace] = await db
    .select({ agencyId: workspaces.agencyId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace || workspace.agencyId !== agencyId) {
    throw new StorageIntentError("storage.workspace_not_found", "Workspace not found");
  }
}

export async function createStorageUploadIntent(input: {
  agencyId: string;
  workspaceId: string;
  userId: string;
  kind: UploadKind;
  extension: string;
  contentType: string;
  expectedByteSize: number;
  checksumSha256?: string;
  originalName?: string;
}) {
  assertUploadInput(input);
  // Confirm tenancy before resolving a provider or creating a presigned URL.
  // A mismatched workspace must not trigger any provider-side side effect.
  await assertWorkspaceBelongsToAgency(input.workspaceId, input.agencyId);
  const context = await getAgencyStorageContext(input.agencyId);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  const safeExtension =
    input.kind === "image" || input.kind === "video" || input.kind === "document"
      ? extensionForContentType(input.contentType)
      : input.extension;
  const objectKey = createAgencyObjectKey({
    agencyId: input.agencyId,
    workspaceId: input.workspaceId,
    extension: safeExtension,
    prefix: context.keyPrefix,
  });
  const signed = await context.adapter.createUploadIntent({
    objectKey,
    contentType: input.contentType,
    contentLength: input.expectedByteSize,
    ...(input.checksumSha256 ? { checksumSha256: input.checksumSha256 } : {}),
    expiresInSeconds: 300,
  });

  try {
    return await db.transaction(async (tx) => {
      await reserveCapacity(tx, input.agencyId, [
        { resource: "storage_bytes", increase: input.expectedByteSize },
      ]);
      const [object] = await tx
        .insert(storageObjects)
        .values({
          agencyId: input.agencyId,
          workspaceId: input.workspaceId,
          bucket: context.bucket,
          objectKey,
          status: "pending",
          kind: input.kind,
          originalName: input.originalName ? sanitizeOriginalFilename(input.originalName) : null,
          mimeType: input.contentType,
          byteSize: input.expectedByteSize,
          checksumSha256: input.checksumSha256 ?? null,
          createdBy: input.userId,
        })
        .returning({ id: storageObjects.id });
      if (!object) throw new Error("Storage object could not be created");
      const [intent] = await tx
        .insert(storageUploadIntents)
        .values({
          agencyId: input.agencyId,
          workspaceId: input.workspaceId,
          objectId: object.id,
          bucket: context.bucket,
          objectKey,
          kind: input.kind,
          extension: safeExtension.replace(/^\./, "").toLowerCase(),
          contentType: input.contentType,
          expectedByteSize: input.expectedByteSize,
          reservedByteSize: input.expectedByteSize,
          checksumSha256: input.checksumSha256 ?? null,
          uploadExpiresAt: expiresAt,
          createdBy: input.userId,
        })
        .returning({ id: storageUploadIntents.id });
      if (!intent) throw new Error("Upload intent could not be created");
      return {
        objectId: object.id,
        uploadIntentId: intent.id,
        uploadUrl: signed.uploadUrl,
        expiresAt: signed.expiresAt,
        ...(signed.requiredHeaders ? { requiredHeaders: signed.requiredHeaders } : {}),
      };
    });
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("limit")) {
      throw new StorageIntentError("storage.quota_exceeded", error.message);
    }
    throw error;
  }
}

export async function completeStorageUpload(input: {
  agencyId: string;
  workspaceId: string;
  intentId: string;
}) {
  const [intent] = await db
    .select()
    .from(storageUploadIntents)
    .where(
      and(
        eq(storageUploadIntents.id, input.intentId),
        eq(storageUploadIntents.agencyId, input.agencyId),
        eq(storageUploadIntents.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!intent) throw new StorageIntentError("storage.intent_not_found", "Upload intent not found");
  if (intent.status === "completed" && intent.objectId) {
    return {
      objectId: intent.objectId,
      objectKey: intent.objectKey,
      size: intent.expectedByteSize,
    };
  }
  if (intent.status !== "reserved" && intent.status !== "uploaded") {
    throw new StorageIntentError(
      "storage.intent_already_final",
      "Upload intent is no longer active",
    );
  }
  if (intent.uploadExpiresAt.getTime() <= Date.now()) {
    await failStorageUpload(input, "expired");
    throw new StorageIntentError("storage.intent_expired", "Upload intent has expired");
  }

  const context = await getAgencyStorageContext(input.agencyId);
  if (!isObjectKeyInAgencyPrefix(intent.objectKey, input.agencyId, context.keyPrefix)) {
    await failStorageUpload(input, "failed", true);
    throw new StorageIntentError("storage.object_verification_failed", "Object prefix is invalid");
  }
  try {
    const metadata = await context.adapter.completeUpload({ objectKey: intent.objectKey });
    if (
      metadata.contentLength !== intent.expectedByteSize ||
      metadata.contentType !== intent.contentType
    ) {
      throw new StorageIntentError(
        "storage.object_verification_failed",
        "Uploaded object metadata does not match the intent",
      );
    }
    if (intent.checksumSha256 && metadata.checksumSha256 !== intent.checksumSha256) {
      throw new StorageIntentError(
        "storage.object_verification_failed",
        "Uploaded object checksum does not match the intent",
      );
    }
    await db.transaction(async (tx) => {
      await tx
        .update(storageUploadIntents)
        .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
        .where(eq(storageUploadIntents.id, intent.id));
      await tx
        .update(storageObjects)
        .set({
          status: "active",
          byteSize: metadata.contentLength,
          checksumSha256: metadata.checksumSha256 ?? intent.checksumSha256 ?? null,
          updatedAt: new Date(),
        })
        .where(eq(storageObjects.id, intent.objectId!));
    });
    return {
      objectId: intent.objectId!,
      objectKey: intent.objectKey,
      size: metadata.contentLength,
    };
  } catch (error) {
    await failStorageUpload(input, "failed", true);
    if (error instanceof StorageIntentError) throw error;
    throw new StorageIntentError(
      "storage.object_verification_failed",
      "Uploaded object could not be verified",
    );
  }
}

async function failStorageUpload(
  input: { agencyId: string; workspaceId: string; intentId: string },
  status: "failed" | "expired" | "aborted",
  deleteRemote = false,
): Promise<void> {
  const objectKey = await db.transaction(async (tx) => {
    const [intent] = await tx
      .select()
      .from(storageUploadIntents)
      .where(
        and(
          eq(storageUploadIntents.id, input.intentId),
          eq(storageUploadIntents.agencyId, input.agencyId),
          eq(storageUploadIntents.workspaceId, input.workspaceId),
          inArray(storageUploadIntents.status, ["reserved", "uploaded"]),
        ),
      )
      .for("update")
      .limit(1);
    if (!intent) return null;
    await releaseCapacityAmount(tx, input.agencyId, [
      { resource: "storage_bytes", increase: intent.reservedByteSize },
    ]);
    await tx
      .update(storageUploadIntents)
      .set({ status, failedAt: new Date(), errorCode: `upload.${status}`, updatedAt: new Date() })
      .where(eq(storageUploadIntents.id, intent.id));
    await tx
      .update(storageObjects)
      .set({ status: "deleted", deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(storageObjects.id, intent.objectId!));
    return intent.objectKey;
  });
  if (deleteRemote && objectKey) {
    try {
      const context = await getAgencyStorageContext(input.agencyId);
      await context.adapter.abortUpload({ objectKey });
    } catch {
      // The object is marked failed and orphan reconciliation retries cleanup.
    }
  }
}

export async function abortStorageUpload(input: {
  agencyId: string;
  workspaceId: string;
  intentId: string;
}): Promise<void> {
  await failStorageUpload(input, "aborted", true);
}

/** Cron-safe cleanup for reservations whose browser never completed. */
export async function expireStorageUploadIntents(limit = 100): Promise<number> {
  const rows = await db
    .select({
      agencyId: storageUploadIntents.agencyId,
      workspaceId: storageUploadIntents.workspaceId,
      id: storageUploadIntents.id,
    })
    .from(storageUploadIntents)
    .where(
      and(
        inArray(storageUploadIntents.status, ["reserved", "uploaded"]),
        lt(storageUploadIntents.uploadExpiresAt, new Date()),
      ),
    )
    .limit(limit);
  for (const row of rows) {
    await failStorageUpload(
      { agencyId: row.agencyId, workspaceId: row.workspaceId, intentId: row.id },
      "expired",
      true,
    );
  }
  return rows.length;
}

/** Remove quarantined provider objects after the retention window. */
export async function purgeSoftDeletedStorageObjects(limit = 100): Promise<number> {
  const rows = await db
    .select({
      id: storageObjects.id,
      agencyId: storageObjects.agencyId,
      objectKey: storageObjects.objectKey,
    })
    .from(storageObjects)
    .where(
      and(eq(storageObjects.status, "soft_deleted"), lte(storageObjects.deleteAfter, new Date())),
    )
    .limit(Math.min(Math.max(limit, 1), 500));

  let purged = 0;
  for (const row of rows) {
    try {
      const context = await getAgencyStorageContext(row.agencyId);
      await context.adapter.deleteObject({ objectKey: row.objectKey });
      await db
        .update(storageObjects)
        .set({ status: "deleted", deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(storageObjects.id, row.id), eq(storageObjects.status, "soft_deleted")));
      purged += 1;
    } catch {
      // Keep the row quarantined so the next scheduled run can retry safely.
    }
  }
  return purged;
}
