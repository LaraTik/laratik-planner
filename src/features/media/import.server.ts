import "server-only";

import type { Actor } from "@/lib/auth/policy";
import { canWriteToWorkspace } from "@/lib/auth/policy";
import { redactMediaSourceUrl, titleFromFilename } from "@/lib/media/contract";
import { MediaPermissionError } from "@/lib/media/errors";
import { fetchPublicMedia, MediaSourceError } from "@/lib/media/source";
import {
  abortStorageUpload,
  completeStorageUpload,
  createStorageUploadIntent,
} from "@/lib/storage/intent-service";
import { registerUploadedMediaAsset } from "./asset-registration.server";

export async function importPublicMediaAsset(input: {
  actor: Actor;
  agencyId: string;
  workspaceId: string;
  url: string;
  title?: string;
  contentItemId?: string;
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
      ...(input.contentItemId ? { contentItemId: input.contentItemId } : {}),
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
