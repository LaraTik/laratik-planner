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
