import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { storageObjects } from "@/lib/db/schema";
import { getAgencyStorageContext } from "./config";

type ReadUrlCacheEntry = {
  url: string;
  expiresAt: number;
};

const readUrlCache = new Map<string, ReadUrlCacheEntry>();
const READ_URL_CACHE_SAFETY_MS = 30_000;
const READ_URL_CACHE_MAX_ENTRIES = 2_000;

function pruneReadUrlCache(now: number) {
  for (const [key, entry] of readUrlCache) {
    if (entry.expiresAt - READ_URL_CACHE_SAFETY_MS <= now) readUrlCache.delete(key);
  }
  while (readUrlCache.size >= READ_URL_CACHE_MAX_ENTRIES) {
    const oldest = readUrlCache.keys().next().value;
    if (typeof oldest !== "string") break;
    readUrlCache.delete(oldest);
  }
}

function readUrlCacheKey(input: {
  agencyId: string;
  bucket: string;
  objectKey: string;
  expiresInSeconds?: number;
}) {
  return [input.agencyId, input.bucket, input.objectKey, input.expiresInSeconds ?? 300].join("\n");
}

async function signReadUrl(input: {
  agencyId: string;
  bucket: string;
  objectKey: string;
  adapter: Awaited<ReturnType<typeof getAgencyStorageContext>>["adapter"];
  expiresInSeconds?: number;
}): Promise<string> {
  const now = Date.now();
  const key = readUrlCacheKey(input);
  const cached = readUrlCache.get(key);
  if (cached && cached.expiresAt - READ_URL_CACHE_SAFETY_MS > now) return cached.url;

  const requestedLifetime = input.expiresInSeconds ?? 300;
  const effectiveLifetime = Math.min(Math.max(requestedLifetime, 30), 900);
  const url = await input.adapter.createReadUrl({
    objectKey: input.objectKey,
    ...(input.expiresInSeconds ? { expiresInSeconds: effectiveLifetime } : {}),
  });
  if (readUrlCache.size >= READ_URL_CACHE_MAX_ENTRIES) pruneReadUrlCache(now);
  readUrlCache.set(key, {
    url,
    expiresAt: now + effectiveLifetime * 1000,
  });
  return url;
}

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
  return signReadUrl({
    agencyId: input.agencyId,
    bucket: context.bucket,
    adapter: context.adapter,
    objectKey: object.objectKey,
    ...(input.expiresInSeconds ? { expiresInSeconds: input.expiresInSeconds } : {}),
  });
}

/**
 * Sign several already-authorized objects with one storage lookup and one
 * provider-context resolution. Callers must perform application-level access
 * checks before invoking this helper; it only enforces object, agency,
 * workspace, status, and bucket matching.
 */
export async function createStorageObjectReadUrls(input: {
  agencyId: string;
  objects: ReadonlyArray<{ objectId: string; workspaceId: string }>;
  expiresInSeconds?: number;
}): Promise<Map<string, string>> {
  const targets = new Map(input.objects.map((object) => [object.objectId, object.workspaceId]));
  if (targets.size === 0) return new Map();

  const rows = await db
    .select({
      id: storageObjects.id,
      objectKey: storageObjects.objectKey,
      bucket: storageObjects.bucket,
      workspaceId: storageObjects.workspaceId,
    })
    .from(storageObjects)
    .where(
      and(
        eq(storageObjects.agencyId, input.agencyId),
        eq(storageObjects.status, "active"),
        inArray(storageObjects.id, [...targets.keys()]),
      ),
    )
    .limit(targets.size);
  if (rows.length === 0) return new Map();

  const context = await getAgencyStorageContext(input.agencyId);
  const signed = await Promise.all(
    rows.map(async (row) => {
      if (row.bucket !== context.bucket || targets.get(row.id) !== row.workspaceId) return null;
      const url = await signReadUrl({
        agencyId: input.agencyId,
        bucket: context.bucket,
        adapter: context.adapter,
        objectKey: row.objectKey,
        ...(input.expiresInSeconds ? { expiresInSeconds: input.expiresInSeconds } : {}),
      });
      return [row.id, url] as const;
    }),
  );

  return new Map(signed.filter((entry): entry is readonly [string, string] => entry !== null));
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
