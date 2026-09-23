import "server-only";

import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { agencyTasks, taskAttachments } from "@/lib/db/schema";
import {
  isAgencyAdmin,
  isAgencyMember,
  type Actor,
  PermissionDeniedError,
} from "@/lib/auth/policy";
import { getAgencyStorageContext } from "@/lib/storage/config";

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

async function taskForActor(actor: Actor, taskId: string) {
  const [task] = await db.select().from(agencyTasks).where(eq(agencyTasks.id, taskId)).limit(1);
  if (!task || !(await isAgencyMember(actor, task.agencyId))) {
    throw new PermissionDeniedError("task.attachment");
  }
  const canManage =
    (await isAgencyAdmin(actor, task.agencyId)) ||
    task.createdBy === actor.id ||
    task.assigneeId === actor.id;
  if (!canManage) throw new PermissionDeniedError("task.attachment");
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

export async function listTaskAttachmentUrls(actor: Actor, taskId: string) {
  const task = await taskForActor(actor, taskId);
  const context = await getAgencyStorageContext(task.agencyId);
  const rows = await db
    .select()
    .from(taskAttachments)
    .where(and(eq(taskAttachments.taskId, taskId), eq(taskAttachments.status, "ready")));
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      url: await context.adapter.createReadUrl({ objectKey: row.objectKey, expiresInSeconds: 300 }),
    })),
  );
}
