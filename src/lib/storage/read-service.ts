import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { storageObjects } from "@/lib/db/schema";
import { getAgencyStorageContext } from "./config";

export async function createStorageObjectReadUrl(input: {
  agencyId: string;
  workspaceId: string;
  objectId: string;
  expiresInSeconds?: number;
}): Promise<string | null> {
  const [object] = await db
    .select({ objectKey: storageObjects.objectKey, bucket: storageObjects.bucket })
    .from(storageObjects)
    .where(
      and(
        eq(storageObjects.id, input.objectId),
        eq(storageObjects.agencyId, input.agencyId),
        eq(storageObjects.workspaceId, input.workspaceId),
        eq(storageObjects.status, "active"),
      ),
    )
    .limit(1);
  if (!object) return null;
  const context = await getAgencyStorageContext(input.agencyId);
  if (object.bucket !== context.bucket) return null;
  return context.adapter.createReadUrl({
    objectKey: object.objectKey,
    ...(input.expiresInSeconds ? { expiresInSeconds: input.expiresInSeconds } : {}),
  });
}

/**
 * Fetch a private object server-side so browser previews stay same-origin.
 * Redirecting an authenticated page to the provider URL makes the browser
 * enforce the page CSP against the provider host and breaks image/video
 * elements even though the signed URL itself is valid.
 */
export async function fetchStorageObject(input: {
  agencyId: string;
  workspaceId: string;
  objectId: string;
  expiresInSeconds?: number;
  headers?: HeadersInit;
}): Promise<Response | null> {
  const url = await createStorageObjectReadUrl(input);
  if (!url) return null;
  try {
    const response = await fetch(url, {
      ...(input.headers ? { headers: input.headers } : {}),
    });
    if (!response.ok || !response.body) return null;
    return response;
  } catch {
    return null;
  }
}
