import "server-only";
import { createStorageObjectReadUrl } from "@/lib/storage/read-service";
import { extractMediaDimensions, validateMediaSignature, type MediaDimensions } from "./contract";

const SIGNATURE_PREFIX_BYTES = 512;
const IMAGE_METADATA_PREFIX_BYTES = 64 * 1024;
const VALIDATION_TIMEOUT_MS = 10_000;

export class MediaValidationError extends Error {
  constructor(
    public readonly code: "invalid_signature" | "storage_unavailable" | "read_failed",
    message: string,
  ) {
    super(message);
    this.name = "MediaValidationError";
  }
}

/** Reads only a bounded prefix from private storage; it never buffers a full video. */
export async function validateStoredMediaObject(input: {
  agencyId: string;
  workspaceId: string;
  objectId: string;
  contentType: string;
}): Promise<MediaDimensions | null> {
  const url = await createStorageObjectReadUrl({
    agencyId: input.agencyId,
    workspaceId: input.workspaceId,
    objectId: input.objectId,
    expiresInSeconds: 60,
  });
  if (!url) {
    throw new MediaValidationError("storage_unavailable", "The media object is not available.");
  }

  const maxBytes = input.contentType.startsWith("image/")
    ? IMAGE_METADATA_PREFIX_BYTES
    : SIGNATURE_PREFIX_BYTES;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Range: `bytes=0-${maxBytes - 1}` },
      signal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
    });
  } catch {
    throw new MediaValidationError("storage_unavailable", "The media object could not be read.");
  }
  if (!response.ok || !response.body) {
    throw new MediaValidationError("storage_unavailable", "The media object could not be read.");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const next = await reader.read();
      if (next.done) break;
      if (next.value) {
        const remaining = maxBytes - total;
        const bounded = next.value.subarray(0, remaining);
        chunks.push(bounded);
        total += bounded.byteLength;
        if (total >= maxBytes) await reader.cancel();
      }
    }
  } catch {
    throw new MediaValidationError("read_failed", "The media object could not be inspected.");
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  const prefix = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const copyLength = Math.min(chunk.byteLength, prefix.byteLength - offset);
    prefix.set(chunk.subarray(0, copyLength), offset);
    offset += copyLength;
    if (offset >= prefix.byteLength) break;
  }
  if (!validateMediaSignature(input.contentType, prefix.subarray(0, SIGNATURE_PREFIX_BYTES)).ok) {
    throw new MediaValidationError(
      "invalid_signature",
      "The media content does not match its declared type.",
    );
  }
  return extractMediaDimensions(input.contentType, prefix);
}
