import "server-only";

import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { db } from "@/lib/db";
import { agencyTasks, taskAttachments } from "@/lib/db/schema";
import { isAgencyMember, type Actor, PermissionDeniedError } from "@/lib/auth/policy";
import { getTaskAccess } from "@/lib/tasks/access";
import { getAgencyStorageContext } from "@/lib/storage/config";
import { StorageConfigurationError } from "@/lib/storage/r2-adapter";
import { captureError } from "@/lib/observability/sentry";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function assertExternalUrl(value: string) {
  const url = new URL(value.trim());
  if (url.protocol !== "https:") throw new Error("task.attachment_url_invalid");
  return url.toString();
}

function externalMimeType(value: string) {
  const path = new URL(value).pathname.toLowerCase();
  if (/\.(jpe?g|png|webp|gif)$/.test(path)) return "image/*";
  if (/\.(mp4|mov|webm)$/.test(path)) return "video/*";
  return "text/uri-list";
}

function externalName(value: string) {
  const segment = new URL(value).pathname.split("/").pop() || "External link";
  try {
    return decodeURIComponent(segment).slice(0, 255) || "External link";
  } catch {
    return segment.slice(0, 255) || "External link";
  }
}

async function taskForActor(actor: Actor, taskId: string) {
  const [task] = await db.select().from(agencyTasks).where(eq(agencyTasks.id, taskId)).limit(1);
  if (!task || !(await getTaskAccess(actor, task)).canManage) {
    throw new PermissionDeniedError("task.attachment");
  }
  return task;
}

async function taskForViewer(actor: Actor, taskId: string) {
  const [task] = await db.select().from(agencyTasks).where(eq(agencyTasks.id, taskId)).limit(1);
  if (!task || !(await isAgencyMember(actor, task.agencyId))) {
    throw new PermissionDeniedError("task.view");
  }
  return task;
}

function safeExtension(name: string) {
  const extension = name.split(".").pop()?.toLowerCase() ?? "bin";
  if (!/^[a-z0-9]{1,8}$/.test(extension)) throw new Error("task.attachment_type_invalid");
  return extension;
}

export async function createTaskAttachmentIntent(
  actor: Actor,
  taskId: string,
  input: { originalName: string; contentType: string; byteSize: number },
) {
  const task = await taskForActor(actor, taskId);
  if (
    !ALLOWED_TYPES.has(input.contentType) ||
    input.byteSize < 1 ||
    input.byteSize > MAX_FILE_SIZE
  ) {
    throw new Error("task.attachment_type_invalid");
  }
  const context = await getAgencyStorageContext(task.agencyId);
  const objectKey = `${context.keyPrefix}/tasks/${taskId}/${randomUUID()}.${safeExtension(input.originalName)}`;
  const signed = await context.adapter.createUploadIntent({
    objectKey,
    contentType: input.contentType,
    contentLength: input.byteSize,
    expiresInSeconds: 300,
  });
  const [attachment] = await db
    .insert(taskAttachments)
    .values({
      agencyId: task.agencyId,
      taskId,
      bucket: context.bucket,
      objectKey,
      originalName: input.originalName.trim().slice(0, 255) || "attachment",
      mimeType: input.contentType,
      byteSize: input.byteSize,
      uploadedBy: actor.id,
    })
    .returning();
  if (!attachment) throw new Error("task.attachment_create_failed");
  return {
    attachmentId: attachment.id,
    uploadUrl: signed.uploadUrl,
    expiresAt: signed.expiresAt,
    ...(signed.requiredHeaders ? { requiredHeaders: signed.requiredHeaders } : {}),
  };
}

export async function completeTaskAttachment(actor: Actor, taskId: string, attachmentId: string) {
  await taskForActor(actor, taskId);
  const [attachment] = await db
    .select()
    .from(taskAttachments)
    .where(and(eq(taskAttachments.id, attachmentId), eq(taskAttachments.taskId, taskId)))
    .limit(1);
  if (!attachment) throw new Error("task.attachment_not_found");
  if (!attachment.objectKey) throw new Error("task.attachment_not_upload");
  const context = await getAgencyStorageContext(attachment.agencyId);
  const metadata = await context.adapter.completeUpload({ objectKey: attachment.objectKey });
  if (
    metadata.contentLength !== attachment.byteSize ||
    metadata.contentType !== attachment.mimeType
  ) {
    await db
      .update(taskAttachments)
      .set({ status: "failed" })
      .where(eq(taskAttachments.id, attachment.id));
    throw new Error("task.attachment_verification_failed");
  }
  const [ready] = await db
    .update(taskAttachments)
    .set({ status: "ready" })
    .where(eq(taskAttachments.id, attachment.id))
    .returning();
  return ready;
}

export async function createTaskAttachmentLink(
  actor: Actor,
  taskId: string,
  input: { url: string; originalName?: string | undefined },
) {
  const task = await taskForActor(actor, taskId);
  const externalUrl = assertExternalUrl(input.url);
  const name = input.originalName?.trim().slice(0, 255) || externalName(externalUrl);
  const [attachment] = await db
    .insert(taskAttachments)
    .values({
      agencyId: task.agencyId,
      taskId,
      bucket: null,
      objectKey: null,
      externalUrl,
      originalName: name || "External link",
      mimeType: externalMimeType(externalUrl),
      byteSize: Buffer.byteLength(externalUrl),
      status: "ready",
      uploadedBy: actor.id,
    })
    .returning();
  if (!attachment) throw new Error("task.attachment_create_failed");
  return attachment;
}

export async function uploadTaskAttachment(
  actor: Actor,
  taskId: string,
  attachmentId: string,
  body: Readable,
) {
  await taskForActor(actor, taskId);
  const [attachment] = await db
    .select()
    .from(taskAttachments)
    .where(
      and(
        eq(taskAttachments.id, attachmentId),
        eq(taskAttachments.taskId, taskId),
        eq(taskAttachments.status, "pending"),
      ),
    )
    .limit(1);
  if (!attachment) throw new Error("task.attachment_not_found");
  if (!attachment.objectKey) throw new Error("task.attachment_not_upload");
  const context = await getAgencyStorageContext(attachment.agencyId);
  await context.adapter.uploadObject({
    objectKey: attachment.objectKey,
    contentType: attachment.mimeType,
    contentLength: attachment.byteSize,
    body,
  });
}

/**
 * Why an attachment has no readable `url`.
 *
 * `null` on `url` means "we could not produce a link for this attachment",
 * and this field says which kind of failure it was so the UI and operators
 * can tell a permanent misconfiguration apart from a provider blip. It is a
 * union rather than a boolean because the two cases are reported and
 * described differently.
 *
 * This deliberately does NOT cover authorization: `PermissionDeniedError`
 * still throws. An unreadable *file* is a data-availability problem, but a
 * denied *task* is a security decision, and the two must never share a
 * signal.
 */
export type TaskAttachmentUrlUnavailableReason = "storage_configuration" | "storage_unavailable";

export type TaskAttachmentWithUrl = Awaited<ReturnType<typeof listTaskAttachmentRows>>[number] & {
  url: string | null;
  urlUnavailableReason: TaskAttachmentUrlUnavailableReason | null;
};

/**
 * List a task's ready attachments with a best-effort read URL each.
 *
 * WHY THIS DEGRADES INSTEAD OF THROWING
 *
 * Object storage is a dependency of the *link*, not of the task. Every
 * caller uses this to enrich an already-authorized task read: the task
 * detail page renders it beside the title/status/activity, and the MCP
 * task tools return it inside the task envelope. When storage is
 * unconfigured, disabled, or unhealthy, throwing `StorageConfigurationError`
 * from here therefore destroyed an otherwise perfectly readable page —
 * the whole task became a 500 because one attachment had no preview URL.
 *
 * So a storage failure degrades to `url: null` + `urlUnavailableReason`,
 * which each caller can render as an explicit "unavailable" state, and the
 * failure is still reported through `captureError` so it stays visible to
 * operators instead of being silently swallowed.
 *
 * The per-attachment signing call is guarded the same way: one object that
 * cannot be signed must not cost the other attachments their URLs.
 */
export async function listTaskAttachmentUrls(
  actor: Actor,
  taskId: string,
): Promise<TaskAttachmentWithUrl[]> {
  const task = await taskForViewer(actor, taskId);
  const rows = await listTaskAttachmentRows(taskId);

  const fileRows = rows.filter((row) => !row.externalUrl);
  let context: Awaited<ReturnType<typeof getAgencyStorageContext>> | null = null;
  let storageFailure: TaskAttachmentUrlUnavailableReason | null = null;

  if (fileRows.length) {
    try {
      context = await getAgencyStorageContext(task.agencyId);
    } catch (error) {
      storageFailure =
        error instanceof StorageConfigurationError
          ? "storage_configuration"
          : "storage_unavailable";
      captureError("task.attachment.list_urls.storage", error, {
        agencyId: task.agencyId,
        taskId,
        fileCount: fileRows.length,
        reason: storageFailure,
      });
    }
  }

  return Promise.all(
    rows.map(async (row): Promise<TaskAttachmentWithUrl> => {
      // An external link carries its own URL and never touches the provider,
      // so it stays usable even when storage is entirely unavailable.
      if (row.externalUrl) return { ...row, url: row.externalUrl, urlUnavailableReason: null };

      const objectKey = row.objectKey;
      if (!context || !objectKey) {
        // `task_attachment_source_valid` guarantees a file row always has an
        // objectKey, so this only happens on the storage-unavailable path.
        return {
          ...row,
          url: null,
          urlUnavailableReason: storageFailure ?? "storage_unavailable",
        };
      }

      try {
        const url = await context.adapter.createReadUrl({ objectKey, expiresInSeconds: 300 });
        return { ...row, url, urlUnavailableReason: null };
      } catch (error) {
        captureError("task.attachment.sign_read_url", error, {
          agencyId: task.agencyId,
          taskId,
          attachmentId: row.id,
        });
        return { ...row, url: null, urlUnavailableReason: "storage_unavailable" };
      }
    }),
  );
}

async function listTaskAttachmentRows(taskId: string) {
  return db
    .select()
    .from(taskAttachments)
    .where(and(eq(taskAttachments.taskId, taskId), eq(taskAttachments.status, "ready")));
}
