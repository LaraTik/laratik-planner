import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { storageObjects } from "@/lib/db/schema";
import { releaseCapacityAmount } from "@/lib/entitlements";

const QUARANTINE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Hide a rejected object immediately and release its reserved quota once. */
export async function quarantineMediaObject(input: {
  agencyId: string;
  objectId: string;
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [object] = await tx
      .select({ byteSize: storageObjects.byteSize })
      .from(storageObjects)
      .where(
        and(
          eq(storageObjects.id, input.objectId),
          eq(storageObjects.agencyId, input.agencyId),
          eq(storageObjects.status, "active"),
        ),
      )
      .for("update")
      .limit(1);
    if (!object) return false;

    const now = new Date();
    await tx
      .update(storageObjects)
      .set({
        status: "soft_deleted",
        deleteAfter: new Date(now.getTime() + QUARANTINE_RETENTION_MS),
        updatedAt: now,
      })
      .where(eq(storageObjects.id, input.objectId));
    await releaseCapacityAmount(tx, input.agencyId, [
      { resource: "storage_bytes", increase: object.byteSize },
    ]);
    return true;
  });
}
